"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelNetworkScanAction,
  enrollFromScanCandidateAction,
  getNetworkScanStatusAction,
  startNetworkScanAction,
} from "@/modules/network/actions";
import type {
  CatalogueLocation,
  CatalogueType,
  ScanCandidateDto,
  ScanJobSnapshot,
} from "@/domain/network";
import { useFormError } from "@/components/ui/form-error-context";

const DISMISS_KEY = "homebase.network.scan.dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
}

type Props = {
  types: CatalogueType[];
  locations: CatalogueLocation[];
};

export function NetworkScanPanel({ types, locations }: Props) {
  const t = useTranslations("network");
  const router = useRouter();
  const { handleActionResult } = useFormError();
  const [pending, startTransition] = useTransition();
  const [job, setJob] = useState<ScanJobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const poll = useCallback(
    (jobId: string) => {
      stopPoll();
      pollRef.current = setInterval(() => {
        startTransition(async () => {
          const result = await getNetworkScanStatusAction(jobId);
          if (!result.ok) {
            setError(result.message);
            stopPoll();
            return;
          }
          setJob(result.data ?? null);
          if (result.data && result.data.state !== "running") {
            stopPoll();
          }
        });
      }, 1000);
    },
    [stopPoll],
  );

  function onStart() {
    setError(null);
    startTransition(async () => {
      const result = await startNetworkScanAction();
      if (!result.ok) {
        handleActionResult(result, "startNetworkScan");
        setError(result.message);
        return;
      }
      const snap = result.data!;
      setJob(snap);
      poll(snap.jobId);
    });
  }

  function onCancel() {
    if (!job) return;
    startTransition(async () => {
      const result = await cancelNetworkScanAction(job.jobId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setJob(result.data ?? null);
      stopPoll();
    });
  }

  function dismiss(ip: string) {
    const next = new Set(dismissed);
    next.add(ip);
    setDismissed(next);
    saveDismissed(next);
  }

  async function enrollCandidate(c: ScanCandidateDto, form: FormData) {
    form.set("ip", c.ip);
    if (c.mac) form.set("mac", c.mac);
    if (c.hostname) form.set("hostname", c.hostname);
    const result = await enrollFromScanCandidateAction(form);
    if (handleActionResult(result, "enrollFromScan")) return;
    dismiss(c.ip);
    router.refresh();
  }

  const running = job?.state === "running";
  const candidates = (job?.candidates ?? []).filter(
    (c) => !dismissed.has(c.ip),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("scanTitle")}</CardTitle>
        <div className="flex gap-2">
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={pending}
            >
              {t("scanCancel")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onStart}
              disabled={pending}
            >
              {t("scanStart")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-500">{t("scanHint")}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {job && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
            {running
              ? t("scanProgress", {
                  done: job.progress.done,
                  total: job.progress.total,
                })
              : job.state === "failed"
                ? job.error || t("scanFailed")
                : job.state === "cancelled"
                  ? t("scanCancelled")
                  : t("scanDone", { count: job.candidates.length })}
          </p>
        )}

        {candidates.length > 0 && (
          <ul className="space-y-3">
            {candidates.map((c) => (
              <li
                key={c.ip}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {c.hostname || c.ip}
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                        {t(`scanStatus_${c.status}`)}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-500">
                      {c.ip}
                      {c.mac ? ` · ${c.mac}` : ""}
                      {c.device_name ? ` · ${c.device_name}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss(c.ip)}
                  >
                    {t("scanDismiss")}
                  </Button>
                </div>
                {c.status === "new" || c.status === "ambiguous" ? (
                  <form
                    className="mt-2 grid gap-2 md:grid-cols-4"
                    action={async (fd) => {
                      await enrollCandidate(c, fd);
                    }}
                  >
                    <div>
                      <Label>{t("name")}</Label>
                      <Input
                        name="name"
                        defaultValue={c.hostname || c.ip}
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <Label>{t("type")}</Label>
                      <select
                        name="type"
                        required
                        className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {types.map((ty) => (
                          <option key={ty.id} value={ty.id}>
                            {ty.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>{t("location")}</Label>
                      <select
                        name="location"
                        required
                        className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" size="sm">
                        {t("enrollBtn")}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
