import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/core/auth/config";

const publicPaths = ["/login", "/register", "/api/auth"];

export async function middleware(request: NextRequest) {
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

  const session = await auth();
  if (!session?.user && !pathname.startsWith("/api/push")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
