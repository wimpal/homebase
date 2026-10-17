import { prisma } from "@/core/db";

export const MAX_TAG_LIST = 200;

export type RecipeTagCount = { tag: string; count: number };

export async function listRecipeTags(
  householdId: string,
): Promise<RecipeTagCount[]> {
  const rows = await prisma.recipe.findMany({
    where: { householdId },
    select: { tags: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const raw of row.tags ?? []) {
      const tag = (raw ?? "").trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort(
      (a, b) =>
        b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
    )
    .slice(0, MAX_TAG_LIST);
}
