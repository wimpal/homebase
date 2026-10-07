import { signOut } from "@/core/auth/config";
import { NextResponse } from "next/server";

/** Redirect to /login on the same host the browser used (LAN or Tailscale Away). */
export async function POST(request: Request) {
  await signOut({ redirect: false });
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(new URL("/login", origin));
}
