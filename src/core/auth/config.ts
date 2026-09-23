import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { canonicalizeEmail } from "@/domain/accounts/email";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = canonicalizeEmail(credentials.email as string);

        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          include: {
            memberships: {
              include: { household: true },
              take: 1,
            },
          },
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          householdId: user.memberships[0]?.householdId,
          role: user.memberships[0]?.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.householdId = (user as { householdId?: string }).householdId;
        token.role = (user as { role?: string }).role;
        token.sessionVersion =
          (user as { sessionVersion?: number }).sessionVersion ?? 0;
        token.email = user.email;
        token.name = user.name;
        return token;
      }

      if (!token.id) return token;

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            id: true,
            email: true,
            name: true,
            sessionVersion: true,
            memberships: {
              take: 1,
              select: { householdId: true, role: true },
            },
          },
        });

        const tokenVersion = (token.sessionVersion as number | undefined) ?? 0;
        if (!dbUser || dbUser.sessionVersion !== tokenVersion) {
          // Force re-login after password change / account removal.
          return {};
        }

        token.email = dbUser.email;
        token.name = dbUser.name;
        token.householdId = dbUser.memberships[0]?.householdId;
        token.role = dbUser.memberships[0]?.role;
        return token;
      } catch {
        // Schema not pushed yet (missing sessionVersion) — keep existing token.
        return token;
      }
    },
  },
});
