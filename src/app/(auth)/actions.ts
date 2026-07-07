"use server";

import { registerUser } from "@/core/auth/config";
import { signIn } from "@/core/auth/config";
import { redirect } from "next/navigation";

export async function registerAction(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const householdName = formData.get("householdName") as string;

  try {
    await registerUser({ name, email, password, householdName });
    await signIn("credentials", { email, password, redirect: false });
    redirect("/dashboard");
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    redirect("/register?error=" + encodeURIComponent(e instanceof Error ? e.message : "Registration failed"));
  }
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    redirect("/login?error=Invalid+credentials");
  }
}
