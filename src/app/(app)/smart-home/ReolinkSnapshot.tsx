"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function ReolinkSnapshot({
  deviceId,
  name,
  bust,
  onRefresh,
}: {
  deviceId: string;
  name: string;
  bust: number;
  onRefresh: () => void;
}) {
  const t = useTranslations("smartHome");
  const [failed, setFailed] = useState(false);

  return (
    <div className="space-y-2">
      {failed ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t("snapshotFailed")}
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={bust}
          src={`/api/cameras/${deviceId}/snapshot?t=${bust}`}
          alt={name}
          className="max-h-64 w-full rounded object-contain bg-zinc-100 dark:bg-zinc-900"
          onLoad={() => setFailed(false)}
          onError={() => setFailed(true)}
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setFailed(false);
          onRefresh();
        }}
      >
        <RefreshCw className="mr-1 h-3.5 w-3.5" />
        {t("refreshSnapshot")}
      </Button>
    </div>
  );
}
