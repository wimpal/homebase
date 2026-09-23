import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config for middleware.
 * No Prisma / Node-only imports — JWT session checks only.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.householdId = (user as { householdId?: string }).householdId;
        token.role = (user as { role?: string }).role;
        token.sessionVersion =
          (user as { sessionVersion?: number }).sessionVersion ?? 0;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.id) {
        return { ...session, user: { ...session.user, id: "" } };
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email =
          (token.email as string | undefined) ?? session.user.email;
        session.user.name =
          (token.name as string | null | undefined) ?? session.user.name;
        session.user.householdId = token.householdId as string | undefined;
        session.user.role = token.role as string | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
