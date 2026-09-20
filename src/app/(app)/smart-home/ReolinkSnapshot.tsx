"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const POLL_MS = 2000;

export function ReolinkSnapshot({
  deviceId,
  name,
  live,
  bust,
  onRefresh,
}: {
  deviceId: string;
  name: string;
  /** True only while Smart Home Cameras tab is selected. */
  live: boolean;
  bust: number;
  onRefresh: () => void;
}) {
  const t = useTranslations("smartHome");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () =>
      typeof document === "undefined" ||
      document.visibilityState === "visible",
  );

  const objectUrlRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const revokeCurrent = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const loadOnce = useCallback(
    async (opts?: { showInitialLoading?: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (opts?.showInitialLoading && !objectUrlRef.current) {
        setInitialLoading(true);
      }

      try {
        const res = await fetch(
          `/api/cameras/${deviceId}/snapshot?t=${Date.now()}`,
          { cache: "no-store", signal: ac.signal },
        );

        if (!res.ok) {
          let message = t("snapshotFailed");
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {
            /* keep generic */
          }
          if (!ac.signal.aborted) {
            setError(message);
            setInitialLoading(false);
          }
          return;
        }

        const blob = await res.blob();
        if (ac.signal.aborted) return;

        const nextUrl = URL.createObjectURL(blob);
        const prev = objectUrlRef.current;
        objectUrlRef.current = nextUrl;
        setObjectUrl(nextUrl);
        setError(null);
        setInitialLoading(false);
        if (prev) URL.revokeObjectURL(prev);
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(t("snapshotFailed"));
        setInitialLoading(false);
      } finally {
        inFlightRef.current = false;
      }
    },
    [deviceId, t],
  );

  useEffect(() => {
    function onVisibility() {
      setPageVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Manual refresh / bust from parent.
  useEffect(() => {
    if (!live || !pageVisible) return;
    void loadOnce({ showInitialLoading: true });
  }, [bust, live, pageVisible, loadOnce]);

  // Gated poll: Cameras tab + page visible; skip overlap via inFlightRef.
  useEffect(() => {
    if (!live || !pageVisible) {
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
      return;
    }

    const id = window.setInterval(() => {
      void loadOnce();
    }, POLL_MS);

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [live, pageVisible, loadOnce]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      revokeCurrent();
    };
  }, [revokeCurrent]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">{t("livePreviewHint")}</p>
      {initialLoading && !objectUrl && (
        <p className="text-sm text-zinc-500">{t("snapshotLoading")}</p>
      )}
      {error && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
      )}
      {objectUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={name}
          className="max-h-64 w-full rounded object-contain bg-zinc-100 dark:bg-zinc-900"
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={initialLoading && !objectUrl}
        onClick={onRefresh}
      >
        <RefreshCw className="mr-1 h-3.5 w-3.5" />
        {t("refreshSnapshot")}
      </Button>
    </div>
  );
}
