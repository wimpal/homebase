"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useMessages, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FormErrorPayload } from "@/components/ui/form-error-context";
import { reportFormErrorToAdminAction } from "@/modules/social/report-form-error";

type ErrorDialogProps = {
  error: FormErrorPayload | null;
  onClose: () => void;
};

type ReasonCopy = { title: string; why: string; fix: string };

function useReasonCopy(reason: string | undefined): ReasonCopy & {
  known: boolean;
} {
  const t = useTranslations("formErrors");
  const messages = useMessages() as {
    formErrors?: { reasons?: Record<string, ReasonCopy> };
  };

  if (reason) {
    const entry = messages.formErrors?.reasons?.[reason];
    if (entry?.title && entry?.why && entry?.fix) {
      return { ...entry, known: true };
    }
  }

  return {
    title: t("generic.title"),
    why: t("generic.why"),
    fix: t("generic.fix"),
    known: false,
  };
}

export function ErrorDialog({ error, onClose }: ErrorDialogProps) {
  const t = useTranslations("formErrors");
  const pathname = usePathname() ?? "/";
  const [pending, startTransition] = useTransition();
  const [reportStatus, setReportStatus] = useState<"idle" | "sent" | "failed">(
    "idle",
  );
  const copy = useReasonCopy(error?.reason);

  const open = error !== null;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReportStatus("idle");
      onClose();
    }
  }

  function handleReport() {
    if (!error || pending || reportStatus === "sent") return;
    startTransition(async () => {
      const result = await reportFormErrorToAdminAction({
        reason: error.reason,
        message: error.message,
        actionName: error.actionName,
        pathname,
        diagnostics: error.diagnostics,
      });
      setReportStatus(result.ok ? "sent" : "failed");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {t("whyLabel")}{" "}
                </span>
                {copy.why}
              </p>
              <p>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {t("fixLabel")}{" "}
                </span>
                {copy.fix}
              </p>
              {!copy.known && error?.message ? (
                <p className="rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {error.message}
                </p>
              ) : null}
              {reportStatus === "sent" ? (
                <p className="text-emerald-700 dark:text-emerald-400">
                  {t("reportSent")}
                </p>
              ) : null}
              {reportStatus === "failed" ? (
                <p className="text-red-600 dark:text-red-400">
                  {t("reportFailed")}
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || reportStatus === "sent"}
            onClick={handleReport}
          >
            {pending ? t("reporting") : t("reportToAdmin")}
          </Button>
          <Button type="button" onClick={() => handleOpenChange(false)}>
            {t("dialogOk")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
