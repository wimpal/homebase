"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmForm } from "@/components/ui/confirm-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteProjectFile, uploadProjectFile } from "@/modules/tasks/actions";

export type ProjectFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date | string;
  user: { id: string; name: string | null } | null;
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectFiles({
  projectId,
  files,
}: {
  projectId: string;
  files: ProjectFileRow[];
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const [preview, setPreview] = useState<ProjectFileRow | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);

  const previewKind = useMemo(() => {
    if (!preview) return null;
    if (preview.mimeType.startsWith("image/")) return "image";
    if (preview.mimeType === "application/pdf") return "pdf";
    if (preview.mimeType.startsWith("text/")) return "text";
    return "other";
  }, [preview]);

  async function openPreview(file: ProjectFileRow) {
    setPreview(file);
    setTextBody(null);
    if (file.mimeType.startsWith("text/")) {
      try {
        const res = await fetch(file.url);
        const raw = await res.text();
        setTextBody(escapeHtml(raw));
      } catch {
        setTextBody(escapeHtml(t("previewLoadFailed")));
      }
    }
  }

  return (
    <div className="space-y-4">
      <form action={uploadProjectFile} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="min-w-[12rem] flex-1">
          <Input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,.md,.txt"
            required
          />
        </div>
        <Button type="submit" size="sm">
          {t("uploadFile")}
        </Button>
      </form>

      {files.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("noFiles")}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800"
            >
              <button
                type="button"
                className="text-left font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                onClick={() => openPreview(file)}
              >
                {file.originalName}
              </button>
              <span className="text-zinc-500">
                {file.mimeType} · {formatBytes(file.sizeBytes)}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => openPreview(file)}>
                  {t("preview")}
                </Button>
                <ConfirmForm action={deleteProjectFile} message={t("confirmDeleteFile")}>
                  <input type="hidden" name="id" value={file.id} />
                  <Button type="submit" size="sm" variant="destructive">
                    {tc("delete")}
                  </Button>
                </ConfirmForm>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle>{preview.originalName}</DialogTitle>
                <DialogDescription>
                  {preview.mimeType} · {formatBytes(preview.sizeBytes)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {previewKind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt="" className="max-h-[60vh] w-full object-contain" />
                )}
                {previewKind === "pdf" && (
                  <iframe
                    title={preview.originalName}
                    src={preview.url}
                    className="h-[60vh] w-full rounded border border-zinc-200 dark:border-zinc-800"
                    sandbox=""
                  />
                )}
                {previewKind === "text" && (
                  <pre
                    className="max-h-[60vh] overflow-auto rounded bg-zinc-50 p-3 text-xs dark:bg-zinc-900"
                    dangerouslySetInnerHTML={{ __html: textBody ?? "…" }}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={preview.url} target="_blank" rel="noreferrer">
                      {t("openInNewTab")}
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <a href={`${preview.url}?download=1`}>
                      {t("download")}
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
