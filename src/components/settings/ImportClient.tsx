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

type ColumnPickers = {
  name: string;
  familyName: string;
  birthday: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  category: string;
  description: string;
};

const EMPTY_PICKERS: ColumnPickers = {
  name: "",
  familyName: "",
  birthday: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  category: "",
  description: "",
};

function pickHeader(headers: string[], aliases: string[]): string {
  const lower = (h: string) => h.trim().toLowerCase();
  return headers.find((h) => aliases.includes(lower(h))) ?? "";
}

function ColumnSelect({
  id,
  label,
  value,
  headers,
  disabled,
  noneLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  headers: string[];
  disabled: boolean;
  noneLabel: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{noneLabel}</option>
        {headers.map((h) => (
          <option key={`${id}-${h}`} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ImportClient({ targets }: { targets: TargetOption[] }) {
  const t = useTranslations("settings.import");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState("products");
  const [headers, setHeaders] = useState<string[]>([]);
  const [pickers, setPickers] = useState<ColumnPickers>(EMPTY_PICKERS);
  const [markNeeded, setMarkNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const selected = targets.find((x) => x.id === target);
  const targetEnabled = selected?.enabled ?? false;
  const isPeople = target === "people";

  function setPicker<K extends keyof ColumnPickers>(key: K, value: string) {
    setPickers((prev) => ({ ...prev, [key]: value }));
    setSummary(null);
  }

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
      fd.set("columnName", pickers.name);
      if (isPeople) {
        fd.set("columnFamilyName", pickers.familyName);
        fd.set("columnBirthday", pickers.birthday);
        fd.set("columnPhone", pickers.phone);
        fd.set("columnEmail", pickers.email);
        fd.set("columnAddress", pickers.address);
        fd.set("columnCity", pickers.city);
        fd.set("columnNotes", pickers.description);
      } else {
        fd.set("columnCategory", pickers.category);
        fd.set("columnDescription", pickers.description);
      }
    }
    if (!isPeople && markNeeded) fd.set("markNeeded", "true");
    return fd;
  }

  function inferPickers(hdrs: string[], forTarget: string) {
    if (forTarget === "people") {
      return {
        ...EMPTY_PICKERS,
        name: pickHeader(hdrs, [
          "name",
          "naam",
          "first name",
          "voornaam",
          "given name",
        ]),
        familyName: pickHeader(hdrs, [
          "achternaam",
          "family name",
          "last name",
          "surname",
          "lastname",
        ]),
        birthday: pickHeader(hdrs, [
          "geboortedatum",
          "birthday",
          "birth date",
          "birthdate",
          "date of birth",
          "dob",
        ]),
        phone: pickHeader(hdrs, [
          "telefoon",
          "phone",
          "tel",
          "mobile",
          "mobiel",
        ]),
        email: pickHeader(hdrs, ["e-mail", "email", "mail"]),
        address: pickHeader(hdrs, ["adres", "address", "street", "straat"]),
        city: pickHeader(hdrs, ["plaats", "city", "plaatsnaam", "woonplaats"]),
        description: pickHeader(hdrs, [
          "notes",
          "notities",
          "note",
          "omschrijving",
        ]),
      };
    }

    return {
      ...EMPTY_PICKERS,
      name: pickHeader(hdrs, [
        "name",
        "title",
        "naam",
        "product",
        "product name",
      ]),
      category: pickHeader(hdrs, ["category", "categorie", "cat"]),
      description: pickHeader(hdrs, [
        "notes",
        "description",
        "notities",
        "omschrijving",
        "note",
      ]),
    };
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setSummary(null);
    setError(null);
    setHeaders([]);
    setPickers(EMPTY_PICKERS);

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
      setPickers(inferPickers(hdrs, target));
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
      <p className="text-sm text-muted-foreground">{t("help")}</p>

      <div className="grid gap-2">
        <Label htmlFor="import-target">{t("target")}</Label>
        <select
          id="import-target"
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setSummary(null);
            setHeaders([]);
            setPickers(EMPTY_PICKERS);
            setMarkNeeded(false);
            if (fileRef.current) fileRef.current.value = "";
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
          <p className="mt-1 text-xs text-muted-foreground">{selected.disabledReason}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="import-file">{t("file")}</Label>
        <Input
          id="import-file"
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          disabled={!targetEnabled || pending}
        />
      </div>

      {headers.length > 0 && !isPeople && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ColumnSelect
            id="import-col-name"
            label={t("columnName")}
            value={pickers.name}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("name", v)}
          />
          <ColumnSelect
            id="import-col-category"
            label={t("columnCategory")}
            value={pickers.category}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("category", v)}
          />
          <ColumnSelect
            id="import-col-desc"
            label={t("columnDescription")}
            value={pickers.description}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("description", v)}
          />
        </div>
      )}

      {headers.length > 0 && isPeople && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ColumnSelect
            id="import-col-name"
            label={t("columnName")}
            value={pickers.name}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("name", v)}
          />
          <ColumnSelect
            id="import-col-family"
            label={t("columnFamilyName")}
            value={pickers.familyName}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("familyName", v)}
          />
          <ColumnSelect
            id="import-col-birthday"
            label={t("columnBirthday")}
            value={pickers.birthday}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("birthday", v)}
          />
          <ColumnSelect
            id="import-col-phone"
            label={t("columnPhone")}
            value={pickers.phone}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("phone", v)}
          />
          <ColumnSelect
            id="import-col-email"
            label={t("columnEmail")}
            value={pickers.email}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("email", v)}
          />
          <ColumnSelect
            id="import-col-address"
            label={t("columnAddress")}
            value={pickers.address}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("address", v)}
          />
          <ColumnSelect
            id="import-col-city"
            label={t("columnCity")}
            value={pickers.city}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("city", v)}
          />
          <ColumnSelect
            id="import-col-notes"
            label={t("columnDescription")}
            value={pickers.description}
            headers={headers}
            disabled={pending}
            noneLabel={t("columnNone")}
            onChange={(v) => setPicker("description", v)}
          />
        </div>
      )}

      {!isPeople && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markNeeded}
              onChange={(e) => setMarkNeeded(e.target.checked)}
              disabled={!targetEnabled || pending}
            />
            {t("markNeeded")}
          </label>
          <p className="text-xs text-muted-foreground">{t("markNeededHint")}</p>
        </>
      )}

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
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {summary && (
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">
            {summary.dryRun ? t("summaryDryRun") : t("summaryApplied")}
          </p>
          <ul className="grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-3">
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
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
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
