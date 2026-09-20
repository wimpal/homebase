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

export function projectDetailPath(projectId: string): string {
  return `/tasks/projects/${projectId}`;
}
