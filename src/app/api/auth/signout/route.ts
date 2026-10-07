import { signOut } from "@/core/auth/config";
import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";

/** Redirect to /login on the same host the browser used (LAN or Tailscale Away). */
export async function POST(request: Request) {
  await signOut({ redirect: false });
  const origin = getRequestOrigin(request.headers);
  return NextResponse.redirect(new URL("/login", origin));
}
