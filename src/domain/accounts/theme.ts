import { prisma } from "@/core/db";
import { DomainError, type DomainResult } from "@/domain/error";
import { isThemePreference, type ThemePreference } from "./theme-preference";

export async function getThemePreference(
  userId: string,
): Promise<ThemePreference | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { themePreference: true },
  });
  const stored = user?.themePreference;
  return isThemePreference(stored) ? stored : null;
}

export async function setThemePreference(
  userId: string,
  value: ThemePreference,
): Promise<DomainResult<void>> {
  if (!isThemePreference(value)) {
    return DomainError.invalidInput(
      "Invalid theme preference.",
      "theme_invalid",
    );
  }
  const result = await prisma.user.updateMany({
    where: { id: userId },
    data: { themePreference: value },
  });
  if (result.count === 0) {
    return DomainError.notFound("Account not found.", "account_not_found");
  }
}
