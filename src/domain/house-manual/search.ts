import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { assertHouseManualEnabled } from "./module-gate";
import {
  HOUSE_MANUAL_QUERY_MAX,
  HOUSE_MANUAL_SEARCH_MAX,
  HOUSE_MANUAL_SNIPPET_CHARS,
  type HouseManualSearchHit,
} from "./types";

function buildSnippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) {
    const slice = text.slice(0, HOUSE_MANUAL_SNIPPET_CHARS).trim();
    return text.length > HOUSE_MANUAL_SNIPPET_CHARS ? `${slice}…` : slice;
  }
  const half = Math.floor(HOUSE_MANUAL_SNIPPET_CHARS / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(text.length, start + HOUSE_MANUAL_SNIPPET_CHARS);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

export async function searchHouseManual(
  householdId: string,
  queryRaw: string,
): Promise<HouseManualSearchHit[] | DomainError> {
  const gated = await assertHouseManualEnabled(householdId);
  if (gated) return gated;

  const query = queryRaw.trim();
  if (!query) {
    return DomainError.invalidInput(
      "Search query is required.",
      "house_manual_query_required",
    );
  }
  if (query.length > HOUSE_MANUAL_QUERY_MAX) {
    return DomainError.invalidInput(
      `Search query must be at most ${HOUSE_MANUAL_QUERY_MAX} characters.`,
      "house_manual_query_too_long",
    );
  }

  const rows = await prisma.houseManualDocument.findMany({
    where: {
      householdId,
      searchable: true,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { extractedText: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      extractedText: true,
    },
    take: 50,
  });

  const qLower = query.toLowerCase();
  const ranked = rows
    .map((row) => {
      const titleHit = row.title.toLowerCase().includes(qLower);
      return {
        id: row.id,
        title: row.title,
        snippet: buildSnippet(
          titleHit ? `${row.title}\n${row.extractedText}` : row.extractedText,
          query,
        ),
        rank: titleHit ? 0 : 1,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .slice(0, HOUSE_MANUAL_SEARCH_MAX)
    .map(({ id, title, snippet }) => ({ id, title, snippet }));

  return ranked;
}
