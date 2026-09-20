/**
 * Shared mcp-smoke leftover purge (prefix match). Used by CLI and mcp-smoke cleanup.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export type PurgeSmokeOptions = {
  householdId?: string;
};

export type PurgeSmokeCounts = {
  changeLog: number;
  notification: number;
  shoppingItem: number;
  product: number;
  chore: number;
  recipe: number;
};

export type PurgeSmokeMatch = {
  id: string;
  label: string;
  householdId: string;
};

export type PurgeSmokeMatches = {
  shoppingItems: PurgeSmokeMatch[];
  products: PurgeSmokeMatch[];
  chores: PurgeSmokeMatch[];
  recipes: PurgeSmokeMatch[];
  notifications: PurgeSmokeMatch[];
};

function notificationWhere(
  householdId?: string,
): Prisma.NotificationWhereInput {
  return {
    title: { contains: "mcp-smoke" },
    ...(householdId ? { householdId } : {}),
  };
}

export async function collectSmokeMatches(
  prisma: PrismaClient,
  options: PurgeSmokeOptions = {},
): Promise<PurgeSmokeMatches> {
  const householdId = options.householdId;

  const [shoppingItems, products, chores, recipes, notifications] =
    await Promise.all([
      prisma.shoppingItem.findMany({
        where: {
          name: { startsWith: "mcp-smoke" },
          ...(householdId
            ? { shoppingList: { householdId } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          shoppingList: { select: { householdId: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.product.findMany({
        where: {
          name: { startsWith: "mcp-smoke" },
          ...(householdId ? { householdId } : {}),
        },
        select: { id: true, name: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.chore.findMany({
        where: {
          title: { startsWith: "mcp-smoke" },
          ...(householdId ? { householdId } : {}),
        },
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.recipe.findMany({
        where: {
          title: { startsWith: "Smoke Add " },
          ...(householdId ? { householdId } : {}),
        },
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.notification.findMany({
        where: notificationWhere(householdId),
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  return {
    shoppingItems: shoppingItems.map((r) => ({
      id: r.id,
      label: r.name,
      householdId: r.shoppingList.householdId,
    })),
    products: products.map((r) => ({
      id: r.id,
      label: r.name,
      householdId: r.householdId,
    })),
    chores: chores.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
    recipes: recipes.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
    notifications: notifications.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
  };
}

/** Apply prefix purge. Returns deleted counts. */
export async function applySmokePurge(
  prisma: PrismaClient,
  options: PurgeSmokeOptions = {},
): Promise<PurgeSmokeCounts> {
  const householdId = options.householdId;
  const matches = await collectSmokeMatches(prisma, options);
  const allEntityIds = [
    ...matches.shoppingItems.map((r) => r.id),
    ...matches.products.map((r) => r.id),
    ...matches.chores.map((r) => r.id),
    ...matches.recipes.map((r) => r.id),
  ];

  const result = await prisma.$transaction(async (tx) => {
    const changeLog =
      allEntityIds.length === 0
        ? { count: 0 }
        : await tx.mcpChangeLog.deleteMany({
            where: {
              entityId: { in: allEntityIds },
              ...(householdId ? { householdId } : {}),
            },
          });

    const notification = await tx.notification.deleteMany({
      where: notificationWhere(householdId),
    });

    const shoppingItem = await tx.shoppingItem.deleteMany({
      where: {
        name: { startsWith: "mcp-smoke" },
        ...(householdId
          ? { shoppingList: { householdId } }
          : {}),
      },
    });

    const product = await tx.product.deleteMany({
      where: {
        name: { startsWith: "mcp-smoke" },
        ...(householdId ? { householdId } : {}),
      },
    });

    const chore = await tx.chore.deleteMany({
      where: {
        title: { startsWith: "mcp-smoke" },
        ...(householdId ? { householdId } : {}),
      },
    });

    const recipe = await tx.recipe.deleteMany({
      where: {
        title: { startsWith: "Smoke Add " },
        ...(householdId ? { householdId } : {}),
      },
    });

    return { changeLog, notification, shoppingItem, product, chore, recipe };
  });

  return {
    changeLog: result.changeLog.count,
    notification: result.notification.count,
    shoppingItem: result.shoppingItem.count,
    product: result.product.count,
    chore: result.chore.count,
    recipe: result.recipe.count,
  };
}

export function formatPurgeCounts(counts: PurgeSmokeCounts): string {
  return [
    `changeLog=${counts.changeLog}`,
    `notification=${counts.notification}`,
    `shopping=${counts.shoppingItem}`,
    `product=${counts.product}`,
    `chore=${counts.chore}`,
    `recipe=${counts.recipe}`,
  ].join(" ");
}

export function totalPurgeCounts(counts: PurgeSmokeCounts): number {
  return (
    counts.changeLog +
    counts.notification +
    counts.shoppingItem +
    counts.product +
    counts.chore +
    counts.recipe
  );
}
