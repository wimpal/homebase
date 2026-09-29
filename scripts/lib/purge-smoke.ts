/**
 * Shared mcp-smoke leftover purge (prefix match). Used by CLI and mcp-smoke cleanup.
 *
 * Match rules:
 *   ShoppingItem / Product — name starts with "mcp-smoke"
 *   Chore                  — title starts with "mcp-smoke"
 *   Recipe                 — title starts with "Smoke Add "
 *   NetworkDevice          — name starts with "Smoke Add " or "mcp-smoke"
 *   DeliveryPackage        — description starts with "mcp-smoke"
 *   HouseManualDocument    — title or originalName starts with "mcp-smoke"
 *   HouseholdNote          — title or body starts with "mcp-smoke"
 *   Notification           — title or message contains "mcp-smoke"
 *   McpChangeLog           — entityId in deleted set OR payloadJson text
 *                            contains "mcp-smoke" / "Smoke Add" (orphan reverts)
 */
import type { Prisma, PrismaClient } from "../../generated/prisma/client";

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
  networkDevice: number;
  deliveryPackage: number;
  houseManualDocument: number;
  householdNote: number;
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
  networkDevices: PurgeSmokeMatch[];
  deliveryPackages: PurgeSmokeMatch[];
  houseManualDocuments: PurgeSmokeMatch[];
  householdNotes: PurgeSmokeMatch[];
  notifications: PurgeSmokeMatch[];
  /** Orphan / payload-matched change-log rows (id + short label). */
  changeLogs: PurgeSmokeMatch[];
};

type ChangeLogRow = {
  id: string;
  entityId: string;
  toolName: string;
  householdId: string;
};

function notificationWhere(
  householdId?: string,
): Prisma.NotificationWhereInput {
  return {
    OR: [
      { title: { contains: "mcp-smoke" } },
      { message: { contains: "mcp-smoke" } },
    ],
    ...(householdId ? { householdId } : {}),
  };
}

function mapChangeLogRows(rows: ChangeLogRow[]): PurgeSmokeMatch[] {
  return rows.map((r) => ({
    id: r.id,
    label: `${r.toolName} entity=${r.entityId}`,
    householdId: r.householdId,
  }));
}

/** McpChangeLog rows matched by entity id set and/or smoke payload text. */
async function collectSmokeChangeLogs(
  prisma: PrismaClient,
  householdId: string | undefined,
  entityIds: string[],
): Promise<PurgeSmokeMatch[]> {
  if (entityIds.length > 0) {
    const rows = householdId
      ? await prisma.$queryRaw<ChangeLogRow[]>`
          SELECT id, "entityId", "toolName", "householdId"
          FROM "McpChangeLog"
          WHERE "householdId" = ${householdId}
            AND (
              "entityId" = ANY(${entityIds})
              OR "payloadJson"::text LIKE ${"%mcp-smoke%"}
              OR "payloadJson"::text LIKE ${"%Smoke Add%"}
            )
          ORDER BY "createdAt" ASC
        `
      : await prisma.$queryRaw<ChangeLogRow[]>`
          SELECT id, "entityId", "toolName", "householdId"
          FROM "McpChangeLog"
          WHERE
            "entityId" = ANY(${entityIds})
            OR "payloadJson"::text LIKE ${"%mcp-smoke%"}
            OR "payloadJson"::text LIKE ${"%Smoke Add%"}
          ORDER BY "createdAt" ASC
        `;
    return mapChangeLogRows(rows);
  }

  const rows = householdId
    ? await prisma.$queryRaw<ChangeLogRow[]>`
        SELECT id, "entityId", "toolName", "householdId"
        FROM "McpChangeLog"
        WHERE "householdId" = ${householdId}
          AND (
            "payloadJson"::text LIKE ${"%mcp-smoke%"}
            OR "payloadJson"::text LIKE ${"%Smoke Add%"}
          )
        ORDER BY "createdAt" ASC
      `
    : await prisma.$queryRaw<ChangeLogRow[]>`
        SELECT id, "entityId", "toolName", "householdId"
        FROM "McpChangeLog"
        WHERE
          "payloadJson"::text LIKE ${"%mcp-smoke%"}
          OR "payloadJson"::text LIKE ${"%Smoke Add%"}
        ORDER BY "createdAt" ASC
      `;
  return mapChangeLogRows(rows);
}

function networkDeviceWhere(
  householdId?: string,
): Prisma.NetworkDeviceWhereInput {
  return {
    OR: [
      { name: { startsWith: "Smoke Add " } },
      { name: { startsWith: "mcp-smoke" } },
    ],
    ...(householdId ? { householdId } : {}),
  };
}

function deliveryPackageWhere(
  householdId?: string,
): Prisma.DeliveryPackageWhereInput {
  return {
    description: { startsWith: "mcp-smoke" },
    ...(householdId ? { householdId } : {}),
  };
}

function houseManualDocumentWhere(
  householdId?: string,
): Prisma.HouseManualDocumentWhereInput {
  return {
    OR: [
      { title: { startsWith: "mcp-smoke" } },
      { originalName: { startsWith: "mcp-smoke" } },
    ],
    ...(householdId ? { householdId } : {}),
  };
}

function householdNoteWhere(
  householdId?: string,
): Prisma.HouseholdNoteWhereInput {
  return {
    OR: [
      { title: { startsWith: "mcp-smoke" } },
      { body: { startsWith: "mcp-smoke" } },
    ],
    ...(householdId ? { householdId } : {}),
  };
}

export async function collectSmokeMatches(
  prisma: PrismaClient,
  options: PurgeSmokeOptions = {},
): Promise<PurgeSmokeMatches> {
  const householdId = options.householdId;

  const [
    shoppingItems,
    products,
    chores,
    recipes,
    networkDevices,
    deliveryPackages,
    houseManualDocuments,
    householdNotes,
    notifications,
  ] = await Promise.all([
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
      prisma.networkDevice.findMany({
        where: networkDeviceWhere(householdId),
        select: { id: true, name: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.deliveryPackage.findMany({
        where: deliveryPackageWhere(householdId),
        select: { id: true, description: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.houseManualDocument.findMany({
        where: houseManualDocumentWhere(householdId),
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.householdNote.findMany({
        where: householdNoteWhere(householdId),
        select: { id: true, title: true, body: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.notification.findMany({
        where: notificationWhere(householdId),
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const entityIds = [
    ...shoppingItems.map((r) => r.id),
    ...products.map((r) => r.id),
    ...chores.map((r) => r.id),
    ...recipes.map((r) => r.id),
    ...networkDevices.map((r) => r.id),
    ...deliveryPackages.map((r) => r.id),
    ...houseManualDocuments.map((r) => r.id),
    ...householdNotes.map((r) => r.id),
  ];

  const changeLogs = await collectSmokeChangeLogs(
    prisma,
    householdId,
    entityIds,
  );

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
    networkDevices: networkDevices.map((r) => ({
      id: r.id,
      label: r.name,
      householdId: r.householdId,
    })),
    deliveryPackages: deliveryPackages.map((r) => ({
      id: r.id,
      label: r.description ?? r.id,
      householdId: r.householdId,
    })),
    houseManualDocuments: houseManualDocuments.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
    householdNotes: householdNotes.map((r) => ({
      id: r.id,
      label: r.title ?? r.body.slice(0, 40),
      householdId: r.householdId,
    })),
    notifications: notifications.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
    changeLogs,
  };
}

export function countSmokeMatchRows(matches: PurgeSmokeMatches): number {
  return (
    matches.shoppingItems.length +
    matches.products.length +
    matches.chores.length +
    matches.recipes.length +
    matches.networkDevices.length +
    matches.deliveryPackages.length +
    matches.houseManualDocuments.length +
    matches.householdNotes.length +
    matches.notifications.length +
    matches.changeLogs.length
  );
}

async function deleteSmokeChangeLogs(
  tx: Prisma.TransactionClient,
  householdId: string | undefined,
  entityIds: string[],
): Promise<number> {
  if (entityIds.length > 0) {
    if (householdId) {
      return Number(
        await tx.$executeRaw`
          DELETE FROM "McpChangeLog"
          WHERE "householdId" = ${householdId}
            AND (
              "entityId" = ANY(${entityIds})
              OR "payloadJson"::text LIKE ${"%mcp-smoke%"}
              OR "payloadJson"::text LIKE ${"%Smoke Add%"}
            )
        `,
      );
    }
    return Number(
      await tx.$executeRaw`
        DELETE FROM "McpChangeLog"
        WHERE
          "entityId" = ANY(${entityIds})
          OR "payloadJson"::text LIKE ${"%mcp-smoke%"}
          OR "payloadJson"::text LIKE ${"%Smoke Add%"}
      `,
    );
  }

  if (householdId) {
    return Number(
      await tx.$executeRaw`
        DELETE FROM "McpChangeLog"
        WHERE "householdId" = ${householdId}
          AND (
            "payloadJson"::text LIKE ${"%mcp-smoke%"}
            OR "payloadJson"::text LIKE ${"%Smoke Add%"}
          )
      `,
    );
  }
  return Number(
    await tx.$executeRaw`
      DELETE FROM "McpChangeLog"
      WHERE
        "payloadJson"::text LIKE ${"%mcp-smoke%"}
        OR "payloadJson"::text LIKE ${"%Smoke Add%"}
    `,
  );
}

/**
 * Apply prefix purge. Returns deleted counts.
 * Deletes primary rows, then re-deletes notifications once (scheduler drain).
 */
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
    ...matches.networkDevices.map((r) => r.id),
    ...matches.deliveryPackages.map((r) => r.id),
    ...matches.houseManualDocuments.map((r) => r.id),
    ...matches.householdNotes.map((r) => r.id),
  ];

  const result = await prisma.$transaction(async (tx) => {
    const changeLogCount = await deleteSmokeChangeLogs(
      tx,
      householdId,
      allEntityIds,
    );

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

    const networkDevice = await tx.networkDevice.deleteMany({
      where: networkDeviceWhere(householdId),
    });

    const deliveryPackage = await tx.deliveryPackage.deleteMany({
      where: deliveryPackageWhere(householdId),
    });

    const houseManualDocument = await tx.houseManualDocument.deleteMany({
      where: houseManualDocumentWhere(householdId),
    });

    const householdNote = await tx.householdNote.deleteMany({
      where: householdNoteWhere(householdId),
    });

    // Drain notifications created mid-transaction / by a concurrent scheduler tick
    // against rows we just removed (no FK — they can linger).
    const notificationDrain = await tx.notification.deleteMany({
      where: notificationWhere(householdId),
    });

    return {
      changeLogCount,
      notification: {
        count: notification.count + notificationDrain.count,
      },
      shoppingItem,
      product,
      chore,
      recipe,
      networkDevice,
      deliveryPackage,
      houseManualDocument,
      householdNote,
    };
  });

  return {
    changeLog: result.changeLogCount,
    notification: result.notification.count,
    shoppingItem: result.shoppingItem.count,
    product: result.product.count,
    chore: result.chore.count,
    recipe: result.recipe.count,
    networkDevice: result.networkDevice.count,
    deliveryPackage: result.deliveryPackage.count,
    houseManualDocument: result.houseManualDocument.count,
    householdNote: result.householdNote.count,
  };
}

/**
 * Re-collect after purge. Returns residual row count (0 = clean).
 * Sweeps late notifications once more before counting.
 */
export async function residualSmokeCount(
  prisma: PrismaClient,
  options: PurgeSmokeOptions = {},
): Promise<number> {
  await new Promise((r) => setTimeout(r, 500));
  await prisma.notification.deleteMany({
    where: notificationWhere(options.householdId),
  });
  const matches = await collectSmokeMatches(prisma, options);
  return countSmokeMatchRows(matches);
}

export function formatPurgeCounts(counts: PurgeSmokeCounts): string {
  return [
    `changeLog=${counts.changeLog}`,
    `notification=${counts.notification}`,
    `shopping=${counts.shoppingItem}`,
    `product=${counts.product}`,
    `chore=${counts.chore}`,
    `recipe=${counts.recipe}`,
    `networkDevice=${counts.networkDevice}`,
    `deliveryPackage=${counts.deliveryPackage}`,
    `houseManual=${counts.houseManualDocument}`,
    `householdNote=${counts.householdNote}`,
  ].join(" ");
}

export function totalPurgeCounts(counts: PurgeSmokeCounts): number {
  return (
    counts.changeLog +
    counts.notification +
    counts.shoppingItem +
    counts.product +
    counts.chore +
    counts.recipe +
    counts.networkDevice +
    counts.deliveryPackage +
    counts.houseManualDocument +
    counts.householdNote
  );
}
