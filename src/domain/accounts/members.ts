import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { DomainError, isDomainError, type DomainResult } from "@/domain/error";
import type { MemberListItem } from "./types";

const MIN_PASSWORD_LEN = 8;

export async function listMembers(
  householdId: string,
): Promise<MemberListItem[]> {
  const memberships = await prisma.membership.findMany({
    where: { householdId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const adminCount = memberships.filter((m) => m.role === "ADMIN").length;

  return memberships.map((m) => ({
    userId: m.user.id,
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    isLastAdmin: m.role === "ADMIN" && adminCount === 1,
  }));
}

export async function adminResetMemberPassword(input: {
  householdId: string;
  targetUserId: string;
  newPassword: string;
}): Promise<DomainResult<{ ok: true }>> {
  if (input.newPassword.length < MIN_PASSWORD_LEN) {
    return DomainError.invalidInput(
      `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
      "password_too_short",
    );
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_householdId: {
        userId: input.targetUserId,
        householdId: input.householdId,
      },
    },
  });
  if (!membership) {
    return DomainError.notFound("Member not found in this household.", "member_not_found");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: input.targetUserId },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 },
    },
  });
  await prisma.passwordResetToken.deleteMany({
    where: { userId: input.targetUserId },
  });

  return { ok: true };
}

export async function adminRemoveMember(input: {
  householdId: string;
  targetUserId: string;
  actorUserId: string;
}): Promise<DomainResult<{ ok: true }>> {
  if (input.targetUserId === input.actorUserId) {
    return DomainError.invalidInput(
      "You cannot remove your own account here.",
      "cannot_remove_self",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: {
          userId_householdId: {
            userId: input.targetUserId,
            householdId: input.householdId,
          },
        },
      });
      if (!membership) {
        throw DomainError.notFound(
          "Member not found in this household.",
          "member_not_found",
        );
      }

      if (membership.role === "ADMIN") {
        const adminCount = await tx.membership.count({
          where: { householdId: input.householdId, role: "ADMIN" },
        });
        if (adminCount <= 1) {
          throw DomainError.conflict(
            "Cannot remove the last ADMIN.",
            "last_admin",
          );
        }
      }

      // Deletes Membership (cascade) and related rows; history SetNull FKs remain.
      await tx.user.delete({ where: { id: input.targetUserId } });
    });
    return { ok: true };
  } catch (e) {
    if (isDomainError(e)) return e;
    return DomainError.internal(
      e instanceof Error ? e.message : "Failed to remove member.",
      "remove_member_failed",
    );
  }
}
