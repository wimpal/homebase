import { randomBytes } from "node:crypto";
import type { CandidateMatchStatus } from "../match";

export type ScanJobState =
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export type ScanCandidateDto = {
  ip: string;
  mac?: string;
  hostname?: string;
  status: CandidateMatchStatus;
  device_id?: string;
  device_name?: string;
  match_reason: string;
};

export type ScanJobSnapshot = {
  jobId: string;
  householdId: string;
  state: ScanJobState;
  progress: { done: number; total: number };
  candidates: ScanCandidateDto[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

type InternalJob = ScanJobSnapshot & {
  abort: AbortController;
  expiresAt: number;
};

const COOLDOWN_MS = 60_000;
const TERMINAL_TTL_MS = 120_000;

const jobs = new Map<string, InternalJob>();
const householdActive = new Map<string, string>();
const householdCooldownUntil = new Map<string, number>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.state !== "running" && job.expiresAt <= now) {
      jobs.delete(id);
    }
  }
}

export function createScanJobId(): string {
  return randomBytes(12).toString("hex");
}

export function canStartScan(
  householdId: string,
): { ok: true } | { ok: false; reason: string } {
  purgeExpired();
  const activeId = householdActive.get(householdId);
  if (activeId) {
    const active = jobs.get(activeId);
    if (active && active.state === "running") {
      return { ok: false, reason: "A scan is already running." };
    }
  }
  const until = householdCooldownUntil.get(householdId) ?? 0;
  if (Date.now() < until) {
    const sec = Math.ceil((until - Date.now()) / 1000);
    return {
      ok: false,
      reason: `Please wait ${sec}s before scanning again.`,
    };
  }
  return { ok: true };
}

export function registerScanJob(
  householdId: string,
  jobId: string,
  total: number,
): InternalJob {
  const abort = new AbortController();
  const job: InternalJob = {
    jobId,
    householdId,
    state: "running",
    progress: { done: 0, total },
    candidates: [],
    startedAt: Date.now(),
    abort,
    expiresAt: Date.now() + TERMINAL_TTL_MS,
  };
  jobs.set(jobId, job);
  householdActive.set(householdId, jobId);
  return job;
}

export function getScanJob(
  jobId: string,
  householdId: string,
): ScanJobSnapshot | null {
  purgeExpired();
  const job = jobs.get(jobId);
  if (!job || job.householdId !== householdId) return null;
  return toSnapshot(job);
}

function toSnapshot(job: InternalJob): ScanJobSnapshot {
  return {
    jobId: job.jobId,
    householdId: job.householdId,
    state: job.state,
    progress: { ...job.progress },
    candidates: [...job.candidates],
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

export function getJobAbort(jobId: string): AbortController | null {
  return jobs.get(jobId)?.abort ?? null;
}

export function updateJobProgress(jobId: string, done: number) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress.done = done;
}

export function appendCandidate(jobId: string, c: ScanCandidateDto) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.candidates.push(c);
}

export function finishJob(
  jobId: string,
  state: Exclude<ScanJobState, "running">,
  error?: string,
) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.state = state;
  job.finishedAt = Date.now();
  job.expiresAt = Date.now() + TERMINAL_TTL_MS;
  if (error) job.error = error;
  if (householdActive.get(job.householdId) === jobId) {
    householdActive.delete(job.householdId);
  }
  householdCooldownUntil.set(job.householdId, Date.now() + COOLDOWN_MS);
}

export function cancelScanJob(
  jobId: string,
  householdId: string,
): ScanJobSnapshot | null {
  const job = jobs.get(jobId);
  if (!job || job.householdId !== householdId) return null;
  if (job.state === "running") {
    job.abort.abort();
    finishJob(jobId, "cancelled");
  }
  return toSnapshot(job);
}

/** Test helper — clear all jobs. */
export function _resetScanJobsForTests() {
  jobs.clear();
  householdActive.clear();
  householdCooldownUntil.clear();
}
