import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { DomainError, isDomainError, type DomainResult } from "@/domain/error";
import { canonicalizeEmail, isValidEmail } from "./email";
import { acquireHouseholdSingletonLock } from "./lock";

const MIN_PASSWORD_LEN = 8;

export type JoinAccountInput = {
  name: string;
  email: string;
  password: string;
};

export type JoinAccountResult = {
  userId: string;
  householdId: string;
  email: string;
};

export async function joinAccount(
  input: JoinAccountInput,
): Promise<DomainResult<JoinAccountResult>> {
  const name = input.name.trim();
  const email = canonicalizeEmail(input.email);
  const password = input.password;

  if (!name) {
    return DomainError.invalidInput("Name is required.", "name_required");
  }
  if (!isValidEmail(email)) {
    return DomainError.invalidInput("Invalid email.", "email_invalid");
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return DomainError.invalidInput(
      `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
      "password_too_short",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await acquireHouseholdSingletonLock(tx);

      const households = await tx.household.findMany({ take: 2 });
      if (households.length === 0) {
        throw DomainError.conflict(
          "No household exists yet. Create a household first.",
          "household_missing",
        );
      }
      if (households.length > 1) {
        throw DomainError.conflict(
          "This install has more than one household and cannot accept Join account.",
          "household_ambiguous",
        );
      }

      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        throw DomainError.conflict("Email already registered.", "email_taken");
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const householdId = households[0].id;

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          memberships: {
            create: {
              role: "MEMBER",
              householdId,
            },
          },
        },
      });

      return {
        userId: user.id,
        householdId,
        email: user.email,
      } satisfies JoinAccountResult;
    });
  } catch (e) {
    if (isDomainError(e)) return e;
    return DomainError.internal(
      e instanceof Error ? e.message : "Failed to join account.",
      "join_account_failed",
    );
  }
}
