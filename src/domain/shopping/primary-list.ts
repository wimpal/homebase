import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";

export async function resolvePrimaryListId(
  householdId: string,
): Promise<string | DomainError> {
  const override = process.env.MCP_SHOPPING_LIST_ID?.trim();
  if (override) {
    const list = await prisma.shoppingList.findFirst({
      where: { id: override, householdId },
      select: { id: true },
    });
    if (!list) {
      return DomainError.invalidInput(
        "MCP_SHOPPING_LIST_ID does not belong to this household.",
      );
    }
    return list.id;
  }

  const list = await prisma.shoppingList.findFirst({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!list) {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { id: true },
    });
    if (!household) {
      return DomainError.notFound("Household not found.");
    }

    const created = await prisma.shoppingList.create({
      data: { householdId, name: "Shopping List" },
      select: { id: true },
    });
    return created.id;
  }

  return list.id;
}
