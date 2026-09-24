"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImportSummary } from "@/domain/import/types";
import {
  applyImportAction,
  parseImportHeadersAction,
  previewImportAction,
} from "@/modules/import/actions";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ChangeEvent } from "react";

type TargetOption = {
  id: string;
  enabled: boolean;
  disabledReason?: string;
};

export function ImportClient({ targets }: { targets: TargetOption[] }) {
  const t = useTranslations("settings.import");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState("products");
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnName, setColumnName] = useState("");
  const [columnCategory, setColumnCategory] = useState("");
  const [columnDescription, setColumnDescription] = useState("");
  const [markNeeded, setMarkNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const selected = targets.find((x) => x.id === target);
  const targetEnabled = selected?.enabled ?? false;

  function buildFormData(): FormData | null {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("fileRequired"));
      return null;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("target", target);
    if (headers.length > 0) {
      fd.set("columnName", columnName);
      fd.set("columnCategory", columnCategory);
      fd.set("columnDescription", columnDescription);
    }
    if (markNeeded) fd.set("markNeeded", "true");
    return fd;
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setSummary(null);
    setError(null);
    setHeaders([]);
    setColumnName("");
    setColumnCategory("");
    setColumnDescription("");

    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.set("file", file);
    fd.set("target", target);

    startTransition(async () => {
      const result = await parseImportHeadersAction(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const hdrs = result.data?.headers ?? [];
      setHeaders(hdrs);

      const lower = (h: string) => h.trim().toLowerCase();
      const pick = (aliases: string[]) =>
        hdrs.find((h) => aliases.includes(lower(h))) ?? "";

      setColumnName(
        pick(["name", "title", "naam", "product", "product name"]),
      );
      setColumnCategory(pick(["category", "categorie", "cat"]));
      setColumnDescription(
        pick([
          "notes",
          "description",
          "notities",
          "omschrijving",
          "note",
        ]),
      );
    });
  }

  function runPreview() {
    setError(null);
    setSummary(null);
    const fd = buildFormData();
    if (!fd) return;
    startTransition(async () => {
      const result = await previewImportAction(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSummary(result.data ?? null);
    });
  }

  function runApply() {
    setError(null);
    const fd = buildFormData();
    if (!fd) return;
    startTransition(async () => {
      const result = await applyImportAction(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSummary(result.data ?? null);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t("help")}</p>

      <div>
        <Label htmlFor="import-target">{t("target")}</Label>
        <select
          id="import-target"
          className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setSummary(null);
          }}
        >
          {targets.map((opt) => (
            <option key={opt.id} value={opt.id} disabled={!opt.enabled}>
              {t(`targets.${opt.id}`)}
              {!opt.enabled ? ` (${t("comingSoon")})` : ""}
            </option>
          ))}
        </select>
        {!targetEnabled && selected?.disabledReason && (
          <p className="mt-1 text-xs text-zinc-500">{selected.disabledReason}</p>
        )}
      </div>

      <div>
        <Label htmlFor="import-file">{t("file")}</Label>
        <Input
          id="import-file"
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="mt-1"
          onChange={onFileChange}
          disabled={!targetEnabled || pending}
        />
      </div>

      {headers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="import-col-name">{t("columnName")}</Label>
            <select
              id="import-col-name"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={columnName}
              onChange={(e) => {
                setColumnName(e.target.value);
                setSummary(null);
              }}
              disabled={pending}
            >
              <option value="">{t("columnNone")}</option>
              {headers.map((h) => (
                <option key={`name-${h}`} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="import-col-category">{t("columnCategory")}</Label>
            <select
              id="import-col-category"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={columnCategory}
              onChange={(e) => {
                setColumnCategory(e.target.value);
                setSummary(null);
              }}
              disabled={pending}
            >
              <option value="">{t("columnNone")}</option>
              {headers.map((h) => (
                <option key={`cat-${h}`} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="import-col-desc">{t("columnDescription")}</Label>
            <select
              id="import-col-desc"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={columnDescription}
              onChange={(e) => {
                setColumnDescription(e.target.value);
                setSummary(null);
              }}
              disabled={pending}
            >
              <option value="">{t("columnNone")}</option>
              {headers.map((h) => (
                <option key={`desc-${h}`} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={markNeeded}
          onChange={(e) => setMarkNeeded(e.target.checked)}
          disabled={!targetEnabled || pending}
        />
        {t("markNeeded")}
      </label>
      <p className="text-xs text-zinc-500">{t("markNeededHint")}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!targetEnabled || pending}
          onClick={runPreview}
        >
          {t("dryRun")}
        </Button>
        <Button
          type="button"
          disabled={!targetEnabled || pending}
          onClick={runApply}
        >
          {t("apply")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {summary && (
        <div className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <p className="font-medium">
            {summary.dryRun ? t("summaryDryRun") : t("summaryApplied")}
          </p>
          <ul className="grid grid-cols-2 gap-1 text-zinc-600 dark:text-zinc-400 sm:grid-cols-3">
            <li>
              {t("counts.created")}: {summary.created}
            </li>
            <li>
              {t("counts.updated")}: {summary.updated}
            </li>
            <li>
              {t("counts.unchanged")}: {summary.unchanged}
            </li>
            <li>
              {t("counts.skipped")}: {summary.skipped}
            </li>
            <li>
              {t("counts.failed")}: {summary.failed}
            </li>
            {summary.needFailed > 0 && (
              <li>
                {t("counts.needFailed")}: {summary.needFailed}
              </li>
            )}
            <li>
              {t("counts.rows")}: {summary.rowCount}
            </li>
          </ul>
          {summary.samples.length > 0 && (
            <div>
              <p className="mt-2 font-medium">{t("samples")}</p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-500">
                {summary.samples.map((s, i) => (
                  <li key={`${s.row}-${i}`}>
                    {t("sampleRow", {
                      row: s.row,
                      name: s.name ?? "—",
                      message: s.message,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
