import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { DomainError, type DomainResult } from "@/domain/error";
import { birthdayToInputValue, parseBirthdayInput } from "./birthday";
import { canonicalizeEmail, isValidEmail } from "./email";
import type { AccountProfile } from "./types";

const MIN_PASSWORD_LEN = 8;

export async function getAccountProfile(
  userId: string,
): Promise<DomainResult<AccountProfile>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, birthday: true },
  });
  if (!user) {
    return DomainError.notFound("Account not found.", "account_not_found");
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    birthday: birthdayToInputValue(user.birthday) || null,
  };
}

export type UpdateAccountInput = {
  userId: string;
  name?: string;
  email?: string;
  birthday?: string | null;
  currentPassword?: string;
  newPassword?: string;
};

export type UpdateAccountResult = {
  emailChanged: boolean;
  passwordChanged: boolean;
  email: string;
};

export async function updateAccount(
  input: UpdateAccountInput,
): Promise<DomainResult<UpdateAccountResult>> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user?.passwordHash) {
    return DomainError.notFound("Account not found.", "account_not_found");
  }

  const data: {
    name?: string;
    email?: string;
    birthday?: Date | null;
    passwordHash?: string;
    sessionVersion?: { increment: number };
  } = {};

  let emailChanged = false;
  let passwordChanged = false;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      return DomainError.invalidInput("Name is required.", "name_required");
    }
    data.name = name;
  }

  if (input.birthday !== undefined) {
    const parsed = parseBirthdayInput(input.birthday);
    if (parsed === "invalid") {
      return DomainError.invalidInput("Invalid birthday.", "birthday_invalid");
    }
    data.birthday = parsed;
  }

  const wantsEmail =
    input.email !== undefined &&
    canonicalizeEmail(input.email) !== canonicalizeEmail(user.email);
  const wantsPassword =
    input.newPassword !== undefined && input.newPassword.length > 0;

  if (wantsEmail || wantsPassword) {
    if (!input.currentPassword) {
      return DomainError.invalidInput(
        "Current password is required to change email or password.",
        "current_password_required",
      );
    }
    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!ok) {
      return DomainError.invalidInput(
        "Current password is incorrect.",
        "current_password_wrong",
      );
    }
  }

  if (wantsEmail && input.email !== undefined) {
    const email = canonicalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return DomainError.invalidInput("Invalid email.", "email_invalid");
    }
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== user.id) {
      return DomainError.conflict("Email already registered.", "email_taken");
    }
    data.email = email;
    emailChanged = true;
  }

  if (wantsPassword && input.newPassword) {
    if (input.newPassword.length < MIN_PASSWORD_LEN) {
      return DomainError.invalidInput(
        `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
        "password_too_short",
      );
    }
    data.passwordHash = await bcrypt.hash(input.newPassword, 12);
    data.sessionVersion = { increment: 1 };
    passwordChanged = true;
  }

  if (Object.keys(data).length === 0) {
    return {
      emailChanged: false,
      passwordChanged: false,
      email: user.email,
    };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  return {
    emailChanged,
    passwordChanged,
    email: updated.email,
  };
}
