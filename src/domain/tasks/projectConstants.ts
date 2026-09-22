export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const WORK_ITEM_STATUSES = ["backlog", "in_progress", "done"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const VISION_PIN_KINDS = ["text", "image"] as const;
export type VisionPinKind = (typeof VISION_PIN_KINDS)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function isWorkItemStatus(value: string): value is WorkItemStatus {
  return (WORK_ITEM_STATUSES as readonly string[]).includes(value);
}

export function isVisionPinKind(value: string): value is VisionPinKind {
  return (VISION_PIN_KINDS as readonly string[]).includes(value);
}

export function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Vision pin width/height as % of board (defaults match schema). */
export const VISION_PIN_SIZE_MIN = 8;
export const VISION_PIN_SIZE_MAX = 45;
export const VISION_PIN_W_DEFAULT = 18;
export const VISION_PIN_H_DEFAULT = 22;

export function clampPinSizePct(value: number): number {
  if (Number.isNaN(value)) return VISION_PIN_SIZE_MIN;
  return Math.min(VISION_PIN_SIZE_MAX, Math.max(VISION_PIN_SIZE_MIN, value));
}

/** Normalize undirected edge so fromPinId < toPinId. */
export function normalizePinLinkIds(pinAId: string, pinBId: string): [string, string] {
  return pinAId < pinBId ? [pinAId, pinBId] : [pinBId, pinAId];
}

export function projectDetailPath(projectId: string): string {
  return `/tasks/projects/${projectId}`;
}
