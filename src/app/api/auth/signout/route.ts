import { signOut } from "@/core/auth/config";
import { NextResponse } from "next/server";

export async function POST() {
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login", process.env.AUTH_URL || "http://localhost:3000"));
}
