"use server";

import { redirect } from "next/navigation";
import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { signIn } from "@/core/auth/config";
import {
  adminRemoveMember,
  adminResetMemberPassword,
  isDomainError,
  updateAccount,
} from "@/domain/accounts";
import { fromDomainError, type ActionResult } from "@/lib/action-result";
import { isNextRedirect } from "@/lib/is-next-redirect";
import { revalidatePath } from "next/cache";

export async function updateAccountAction(
  formData: FormData,
): Promise<ActionResult> {
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
    return fromDomainError(result);
  }

  if (result.passwordChanged) {
    try {
      await signIn("credentials", {
        email: result.email,
        password: newPassword,
        redirect: false,
      });
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      redirect("/login?status=password_reset");
    }
  } else if (result.emailChanged) {
    try {
      await signIn("credentials", {
        email: result.email,
        password: currentPassword,
        redirect: false,
      });
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      redirect("/login");
    }
  }

  revalidatePath("/settings");
  redirect("/settings?status=account_saved");
}

export async function adminResetMemberPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireAdmin();
  const targetUserId = (formData.get("userId") as string) || "";
  const newPassword = (formData.get("newPassword") as string) || "";

  const result = await adminResetMemberPassword({
    householdId,
    targetUserId,
    newPassword,
  });
  if (isDomainError(result)) {
    return fromDomainError(result);
  }

  revalidatePath("/settings");
  redirect("/settings?status=member_password_reset");
}

export async function adminRemoveMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId, userId } = await requireAdmin();
  const targetUserId = (formData.get("userId") as string) || "";

  const result = await adminRemoveMember({
    householdId,
    targetUserId,
    actorUserId: userId,
  });
  if (isDomainError(result)) {
    return fromDomainError(result);
  }

  revalidatePath("/settings");
  redirect("/settings?status=member_removed");
}
