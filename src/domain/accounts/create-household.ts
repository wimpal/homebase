import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { initializeModuleSettings } from "@/core/modules/settings";
import { DomainError, isDomainError, type DomainResult } from "@/domain/error";
import { canonicalizeEmail, isValidEmail } from "./email";
import { acquireHouseholdSingletonLock } from "./lock";

const MIN_PASSWORD_LEN = 8;

export type CreateHouseholdInput = {
  name: string;
  email: string;
  password: string;
  householdName: string;
};

export type CreateHouseholdResult = {
  userId: string;
  householdId: string;
  email: string;
};

export async function createHousehold(
  input: CreateHouseholdInput,
): Promise<DomainResult<CreateHouseholdResult>> {
  const name = input.name.trim();
  const householdName = input.householdName.trim();
  const email = canonicalizeEmail(input.email);
  const password = input.password;

  if (!name) {
    return DomainError.invalidInput("Name is required.", "name_required");
  }
  if (!householdName) {
    return DomainError.invalidInput("Household name is required.", "household_name_required");
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
    const result = await prisma.$transaction(async (tx) => {
      await acquireHouseholdSingletonLock(tx);

      const count = await tx.household.count();
      if (count !== 0) {
        throw DomainError.conflict(
          "A household already exists on this install. Use Join account instead.",
          "household_exists",
        );
      }

      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        throw DomainError.conflict("Email already registered.", "email_taken");
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          memberships: {
            create: {
              role: "ADMIN",
              household: {
                create: { name: householdName },
              },
            },
          },
        },
        include: {
          memberships: true,
        },
      });

      const householdId = user.memberships[0].householdId;

      await tx.shoppingList.create({
        data: { householdId, name: "Main Shopping List" },
      });

      await tx.badge.createMany({
        data: [
          {
            name: "First Task",
            description: "Complete your first routine task",
            icon: "star",
          },
          {
            name: "Week Streak",
            description: "Maintain a 7-day streak",
            icon: "flame",
          },
          {
            name: "Green Thumb",
            description: "Water 10 plants",
            icon: "leaf",
          },
        ],
        skipDuplicates: true,
      });

      return {
        userId: user.id,
        householdId,
        email: user.email,
      } satisfies CreateHouseholdResult;
    });

    await initializeModuleSettings(result.householdId);
    return result;
  } catch (e) {
    if (isDomainError(e)) return e;
    return DomainError.internal(
      e instanceof Error ? e.message : "Failed to create household.",
      "create_household_failed",
    );
  }
}
