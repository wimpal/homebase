import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/core/auth/auth.config";

const { auth } = NextAuth(authConfig);

const publicPaths = [
  "/login",
  "/register",
  "/join",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname === "/health" ||
    pathname === "/mcp" ||
    pathname.startsWith("/_next") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/api/uploads")
  ) {
    return NextResponse.next();
  }

  if (!request.auth?.user?.id && !pathname.startsWith("/api/push")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
