"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  confirmDirigeraImportAction,
  previewDirigeraImportAction,
} from "@/modules/network/actions";
import type {
  CatalogueLocation,
  CatalogueType,
  ConfirmDirigeraImportSummary,
  DirigeraImportPreview,
} from "@/domain/network";
import { useFormError } from "@/components/ui/form-error-context";

type Props = {
  types: CatalogueType[];
  locations: CatalogueLocation[];
};

export function NetworkDirigeraImportPanel({ types, locations }: Props) {
  const t = useTranslations("network");
  const router = useRouter();
  const { handleActionResult } = useFormError();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<DirigeraImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createMissingLocations, setCreateMissingLocations] = useState(false);
  const [summary, setSummary] = useState<ConfirmDirigeraImportSummary | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const typeName = (slug: string) =>
    types.find((ty) => ty.slug === slug)?.name ?? slug;
  const locationName = (slug: string) =>
    locations.find((loc) => loc.slug === slug)?.name ?? slug;

  function onPreview() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const result = await previewDirigeraImportAction();
      if (!result.ok) {
        handleActionResult(result, "previewDirigeraImport");
        setError(result.message);
        setPreview(null);
        return;
      }
      const data = result.data!;
      setPreview(data);
      setSelected(
        new Set(
          data.candidates
            .filter((candidate) => candidate.status === "new")
            .map((candidate) => candidate.dirigeraId),
        ),
      );
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onConfirm() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmDirigeraImportAction(
        [...selected],
        createMissingLocations,
      );
      if (!result.ok) {
        handleActionResult(result, "confirmDirigeraImport");
        setError(result.message);
        return;
      }
      setSummary(result.data!);
      setSelected(new Set());
      router.refresh();

      const refreshed = await previewDirigeraImportAction();
      if (refreshed.ok) setPreview(refreshed.data!);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("dirigeraTitle")}</CardTitle>
        <Button
          type="button"
          size="sm"
          variant={preview ? "outline" : "default"}
          onClick={onPreview}
          disabled={pending}
        >
          {preview ? t("dirigeraRefresh") : t("dirigeraPreview")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-500">{t("dirigeraHint")}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}

        {preview && preview.candidates.length === 0 && (
          <p className="text-sm text-zinc-500">{t("dirigeraNothing")}</p>
        )}

        {preview && preview.candidates.length > 0 && (
          <>
            <ul className="space-y-2">
              {preview.candidates.map((candidate) => (
                <li
                  key={candidate.dirigeraId}
                  className="flex flex-wrap items-start gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                    checked={selected.has(candidate.dirigeraId)}
                    disabled={candidate.status !== "new"}
                    onChange={() => toggle(candidate.dirigeraId)}
                    aria-label={candidate.name}
                  />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {candidate.name}
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                        {t(`dirigeraStatus_${candidate.status}`)}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-500">
                      {typeName(candidate.typeSlug)} · {candidate.deviceType} ·{" "}
                      {candidate.locationStatus === "matched"
                        ? t("dirigeraLocation_matched", {
                            name: locationName(candidate.locationSlug),
                          })
                        : candidate.locationStatus === "missing"
                          ? t("dirigeraLocation_missing", {
                              name: candidate.roomName ?? "",
                            })
                          : t("dirigeraLocation_none")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="dirigera-create-locations"
                className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                checked={createMissingLocations}
                onChange={(event) =>
                  setCreateMissingLocations(event.target.checked)
                }
              />
              <div>
                <Label
                  htmlFor="dirigera-create-locations"
                  className="font-normal"
                >
                  {t("dirigeraCreateLocations")}
                </Label>
                <p className="text-xs text-zinc-500">
                  {t("dirigeraCreateLocationsHint")}
                </p>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={onConfirm}
              disabled={pending || selected.size === 0}
            >
              {t("dirigeraConfirm", { count: selected.size })}
            </Button>
          </>
        )}

        {summary && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
            <p>
              {t("dirigeraSummary", {
                created: summary.created,
                enrolled: summary.skipped_enrolled,
                retired: summary.skipped_retired,
                missing: summary.skipped_missing_on_hub,
                locations: summary.locations_created,
              })}
            </p>
            {summary.failed.length > 0 && (
              <ul className="mt-1 text-red-600">
                {summary.failed.map((failure) => (
                  <li key={failure.dirigeraId}>{failure.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
