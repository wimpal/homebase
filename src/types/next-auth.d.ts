import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      householdId?: string;
      role?: string;
    };
  }

  interface User {
    householdId?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    householdId?: string;
    role?: string;
  }
}
