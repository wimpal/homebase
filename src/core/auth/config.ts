import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { initializeModuleSettings } from "@/core/modules/settings";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.householdId = (user as { householdId?: string }).householdId;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.householdId = token.householdId as string | undefined;
        session.user.role = token.role as string | undefined;
      }
      return session;
    },
  },
});

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  householdName: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      memberships: {
        create: {
          role: "ADMIN",
          household: {
            create: { name: input.householdName },
          },
        },
      },
    },
    include: {
      memberships: { include: { household: true } },
    },
  });

  const householdId = user.memberships[0].householdId;
  await initializeModuleSettings(householdId);

  const defaultList = await prisma.shoppingList.create({
    data: { householdId, name: "Main Shopping List" },
  });

  await prisma.badge.createMany({
    data: [
      { name: "First Task", description: "Complete your first routine task", icon: "star" },
      { name: "Week Streak", description: "Maintain a 7-day streak", icon: "flame" },
      { name: "Green Thumb", description: "Water 10 plants", icon: "leaf" },
    ],
    skipDuplicates: true,
  });

  return { user, householdId, defaultListId: defaultList.id };
}
