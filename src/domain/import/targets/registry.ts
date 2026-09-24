import type { ImportTargetId } from "../types";

export interface ImportTargetDef {
  id: ImportTargetId;
  enabled: boolean;
  /** Shown when disabled; English operator message (UI may i18n separately). */
  disabledReason?: string;
  labelKey: string;
}

const TARGETS: Record<ImportTargetId, ImportTargetDef> = {
  products: {
    id: "products",
    enabled: true,
    labelKey: "targets.products",
  },
  people: {
    id: "people",
    enabled: false,
    disabledReason: "People import ships after T-097 (contacts directory).",
    labelKey: "targets.people",
  },
};

export function getImportTarget(id: string): ImportTargetDef | null {
  if (id === "products" || id === "people") return TARGETS[id];
  return null;
}

export function listImportTargets(): ImportTargetDef[] {
  return Object.values(TARGETS);
}
