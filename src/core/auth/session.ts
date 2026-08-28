import { auth } from "@/core/auth/config";
import { prisma } from "@/core/db";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function requireHousehold() {
  const session = await requireSession();
  const householdId = session.user.householdId;

  if (!householdId) {
    redirect("/login");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_householdId: {
        userId: session.user.id,
        householdId,
      },
    },
    include: { household: true },
  });

  if (!membership) {
    redirect("/login");
  }

  return {
    session,
    householdId,
    userId: session.user.id,
    role: membership.role,
    household: membership.household,
  };
}

export async function requireAdmin() {
  const ctx = await requireHousehold();
  if (ctx.role !== "ADMIN") {
    throw new Error("Admin access required");
  }
  return ctx;
}

export async function requireMutationAccess(moduleId: ModuleId) {
  const ctx = await requireHousehold();
  if (ctx.role === "GUEST") {
    throw new Error("Guest accounts are read-only");
  }
  await requireModule(ctx.householdId, moduleId);
  return ctx;
}
