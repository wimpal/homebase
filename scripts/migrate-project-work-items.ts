/**
 * T-082 data migration — raw SQL so it runs BEFORE `prisma db push`
 * on databases that still have ProjectStep.
 *
 *   npx tsx scripts/migrate-project-work-items.ts
 *
 * Safe to re-run. Deploy order: this script → db push --accept-data-loss
 *
 * Copies ProjectStep → ProjectWorkItem (completed → done, else backlog),
 * then drops ProjectStep only after a verified copy.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function newId(): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(8).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `cm${time}${rand}`.slice(0, 25);
}

type TableRow = { exists: boolean };

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<TableRow[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

type StepRow = {
  id: string;
  projectId: string;
  title: string;
  completed: boolean;
  order: number;
};

async function ensureWorkItemTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectWorkItem" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "notes" TEXT,
      "status" TEXT NOT NULL DEFAULT 'backlog',
      "order" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectWorkItem_projectId_status_order_idx"
    ON "ProjectWorkItem" ("projectId", "status", "order")
  `);
}

async function copyStepsToWorkItems() {
  const hasSteps = await tableExists("ProjectStep");
  if (!hasSteps) {
    console.log("No ProjectStep table — nothing to migrate.");
    return;
  }

  await ensureWorkItemTable();

  const steps = await prisma.$queryRaw<StepRow[]>`
    SELECT id, "projectId", title, completed, "order"
    FROM "ProjectStep"
    ORDER BY "projectId" ASC, "order" ASC
  `;

  let copied = 0;
  for (const step of steps) {
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ProjectWorkItem"
      WHERE "projectId" = ${step.projectId}
        AND title = ${step.title}
        AND "order" = ${step.order}
      LIMIT 1
    `;
    if (existing.length > 0) continue;

    const status = step.completed ? "done" : "backlog";
    const id = newId();
    await prisma.$executeRaw`
      INSERT INTO "ProjectWorkItem"
        ("id", "projectId", "title", "notes", "status", "order", "createdAt", "updatedAt")
      VALUES
        (${id}, ${step.projectId}, ${step.title}, NULL, ${status}, ${step.order}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    copied += 1;
  }
  console.log(`Copied ${copied} ProjectStep row(s) into ProjectWorkItem (${steps.length} source).`);

  const remaining = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "ProjectStep"
  `;
  const workCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "ProjectWorkItem"
  `;
  const stepCount = Number(remaining[0]?.count ?? 0);
  const itemCount = Number(workCount[0]?.count ?? 0);
  if (stepCount > 0 && itemCount < stepCount) {
    throw new Error(
      `Migration incomplete: ProjectStep=${stepCount}, ProjectWorkItem=${itemCount}. Not dropping ProjectStep.`,
    );
  }

  // Drop only when every step has a corresponding work item by count (idempotent re-runs may have more items).
  if (stepCount === 0) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "ProjectStep"`);
    console.log("ProjectStep empty — dropped leftover table if present.");
    return;
  }

  // Verify one-to-one by counting unmatched: for each step, a work item with same project/title/order.
  const unmatched = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "ProjectStep" s
    WHERE NOT EXISTS (
      SELECT 1 FROM "ProjectWorkItem" w
      WHERE w."projectId" = s."projectId"
        AND w.title = s.title
        AND w."order" = s."order"
    )
  `;
  if (Number(unmatched[0]?.count ?? 0) > 0) {
    throw new Error("Unmatched ProjectStep rows remain — not dropping ProjectStep.");
  }

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "ProjectStep"`);
  console.log("Dropped ProjectStep after verified copy.");
}

async function main() {
  await copyStepsToWorkItems();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
