"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { signIn } from "@/core/auth/config";
import {
  adminRemoveMember,
  adminResetMemberPassword,
  isDomainError,
  updateAccount,
} from "@/domain/accounts";

function settingsError(reason: string, message: string) {
  const q = new URLSearchParams();
  q.set("error", reason);
  q.set("message", message);
  redirect(`/settings?${q.toString()}`);
}

export async function updateAccountAction(formData: FormData) {
  const { userId } = await requireHousehold();

  const name = (formData.get("name") as string) || "";
  const email = (formData.get("email") as string) || "";
  const birthdayRaw = (formData.get("birthday") as string) || "";
  const currentPassword = (formData.get("currentPassword") as string) || "";
  const newPassword = (formData.get("newPassword") as string) || "";

  const result = await updateAccount({
    userId,
    name,
    email,
    birthday: birthdayRaw,
    currentPassword: currentPassword || undefined,
    newPassword: newPassword || undefined,
  });

  if (isDomainError(result)) {
    settingsError(result.reason || "update_failed", result.message);
    return;
  }

  if (result.passwordChanged) {
    // Session revoked via sessionVersion — sign in again with new password.
    try {
      await signIn("credentials", {
        email: result.email,
        password: newPassword,
        redirect: false,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
      redirect("/login?status=password_reset");
    }
  } else if (result.emailChanged) {
    // Re-issue JWT with new email; password unchanged — need current password.
    try {
      await signIn("credentials", {
        email: result.email,
        password: currentPassword,
        redirect: false,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
      redirect("/login");
    }
  }

  revalidatePath("/settings");
  redirect("/settings?status=account_saved");
}

export async function adminResetMemberPasswordAction(formData: FormData) {
  const { householdId } = await requireAdmin();
  const targetUserId = (formData.get("userId") as string) || "";
  const newPassword = (formData.get("newPassword") as string) || "";

  const result = await adminResetMemberPassword({
    householdId,
    targetUserId,
    newPassword,
  });
  if (isDomainError(result)) {
    settingsError(result.reason || "reset_failed", result.message);
    return;
  }

  revalidatePath("/settings");
  redirect("/settings?status=member_password_reset");
}

export async function adminRemoveMemberAction(formData: FormData) {
  const { householdId, userId } = await requireAdmin();
  const targetUserId = (formData.get("userId") as string) || "";

  const result = await adminRemoveMember({
    householdId,
    targetUserId,
    actorUserId: userId,
  });
  if (isDomainError(result)) {
    settingsError(result.reason || "remove_failed", result.message);
    return;
  }

  revalidatePath("/settings");
  redirect("/settings?status=member_removed");
}
