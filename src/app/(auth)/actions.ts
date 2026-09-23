"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/core/auth/config";
import {
  createHousehold,
  isDomainError,
  joinAccount,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/domain/accounts";
import { canonicalizeEmail } from "@/domain/accounts/email";

function errorRedirect(path: string, reason: string, message?: string) {
  const q = new URLSearchParams();
  q.set("error", reason);
  if (message) q.set("message", message);
  redirect(`${path}?${q.toString()}`);
}

export async function loginAction(formData: FormData) {
  const email = canonicalizeEmail((formData.get("email") as string) || "");
  const password = (formData.get("password") as string) || "";

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    redirect("/login?error=invalid_credentials");
  }
}

export async function createHouseholdAction(formData: FormData) {
  const name = (formData.get("name") as string) || "";
  const email = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";
  const householdName = (formData.get("householdName") as string) || "";

  const result = await createHousehold({ name, email, password, householdName });
  if (isDomainError(result)) {
    errorRedirect("/register", result.reason || "create_failed", result.message);
    return;
  }

  try {
    await signIn("credentials", {
      email: result.email,
      password,
      redirect: false,
    });
    redirect("/dashboard");
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    redirect("/login?error=signin_after_create");
  }
}

export async function joinAccountAction(formData: FormData) {
  const name = (formData.get("name") as string) || "";
  const email = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";

  const result = await joinAccount({ name, email, password });
  if (isDomainError(result)) {
    errorRedirect("/join", result.reason || "join_failed", result.message);
    return;
  }

  try {
    await signIn("credentials", {
      email: result.email,
      password,
      redirect: false,
    });
    redirect("/dashboard");
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    redirect("/login?error=signin_after_join");
  }
}

export async function forgotPasswordAction(formData: FormData) {
  const email = (formData.get("email") as string) || "";
  const result = await requestPasswordReset(email);
  if (isDomainError(result)) {
    errorRedirect("/forgot-password", result.reason || "reset_failed", result.message);
    return;
  }
  if (result.status === "smtp_unset") {
    redirect("/forgot-password?status=smtp_unset");
  }
  redirect("/forgot-password?status=sent");
}

export async function resetPasswordAction(formData: FormData) {
  const token = (formData.get("token") as string) || "";
  const password = (formData.get("password") as string) || "";
  const result = await resetPasswordWithToken(token, password);
  if (isDomainError(result)) {
    errorRedirect(
      `/reset-password?token=${encodeURIComponent(token)}`,
      result.reason || "reset_failed",
      result.message,
    );
    return;
  }
  redirect("/login?status=password_reset");
}
