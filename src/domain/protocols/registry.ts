/**
 * Code-seeded Protocol catalogue (T-115).
 * Cinema steps are fixed in run.ts — not a step CRUD editor.
 * Blinds: stub only — never executed in v1.
 */

export type ProtocolDefinition = {
  id: string;
  name: string;
  aliases: string[];
};

export const CINEMA_PROTOCOL_ID = "cinema";

export const SEEDED_PROTOCOLS: readonly ProtocolDefinition[] = [
  {
    id: CINEMA_PROTOCOL_ID,
    name: "Cinema",
    aliases: ["bioscoop"],
  },
] as const;

export function listSeededProtocols(): ProtocolDefinition[] {
  return SEEDED_PROTOCOLS.map((p) => ({
    id: p.id,
    name: p.name,
    aliases: [...p.aliases],
  }));
}

/** Resolve canonical name or alias (case-insensitive). */
export function resolveProtocol(
  nameOrAlias: string,
): ProtocolDefinition | null {
  const needle = nameOrAlias.trim().toLowerCase();
  if (!needle) return null;
  for (const p of SEEDED_PROTOCOLS) {
    if (p.name.toLowerCase() === needle || p.id === needle) return { ...p, aliases: [...p.aliases] };
    if (p.aliases.some((a) => a.toLowerCase() === needle)) {
      return { ...p, aliases: [...p.aliases] };
    }
  }
  return null;
}
