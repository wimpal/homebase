"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { FormAction } from "@/components/ui/form-action";
import {
  clearNetworkDeviceSsapAction,
  listNetworkDeviceSsapAppsAction,
  pairNetworkDeviceSsapAction,
  updateNetworkDeviceSsapSettingsAction,
} from "@/modules/network/actions";
import type { NetworkDeviceUiRow, SsapAppListItem } from "@/domain/network";

type Props = {
  device: NetworkDeviceUiRow;
};

function PairSubmitButton({ paired }: { paired: boolean }) {
  const t = useTranslations("network");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending
        ? t("ssapPairPending")
        : paired
          ? t("ssapRepair")
          : t("ssapPair")}
    </Button>
  );
}

export function NetworkTvSsapPanel({ device }: Props) {
  const t = useTranslations("network");
  const [apps, setApps] = useState<SsapAppListItem[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [jellyfinId, setJellyfinId] = useState(device.jellyfin_app_id ?? "");

  function refreshApps() {
    setAppsError(null);
    startTransition(async () => {
      const result = await listNetworkDeviceSsapAppsAction(device.id);
      if (!result.ok) {
        setAppsError(result.message);
        setApps([]);
        return;
      }
      setApps(result.data ?? []);
    });
  }

  return (
    <div className="space-y-3 border-t border-zinc-100 pt-3 md:col-span-2 dark:border-zinc-800">
      <p className="text-sm font-medium">{t("ssapTitle")}</p>
      <p className="text-xs text-zinc-500">{t("ssapHint")}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {device.ssap_paired ? t("ssapPaired") : t("ssapUnpaired")}
      </p>

      <div className="flex flex-wrap gap-2">
        <FormAction
          action={pairNetworkDeviceSsapAction}
          actionName="pairNetworkDeviceSsap"
          onSuccess={() => {
            refreshApps();
          }}
        >
          <input type="hidden" name="id" value={device.id} />
          <PairSubmitButton paired={device.ssap_paired} />
        </FormAction>
        {device.ssap_paired && (
          <>
            <ConfirmFormAction
              action={clearNetworkDeviceSsapAction}
              actionName="clearNetworkDeviceSsap"
              message={t("confirmClearSsap")}
            >
              <input type="hidden" name="id" value={device.id} />
              <Button type="submit" size="sm" variant="outline">
                {t("ssapClear")}
              </Button>
            </ConfirmFormAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={refreshApps}
            >
              {t("ssapListApps")}
            </Button>
          </>
        )}
      </div>

      {appsError && (
        <p className="text-sm text-red-600 dark:text-red-400">{appsError}</p>
      )}

      <FormAction
        action={updateNetworkDeviceSsapSettingsAction}
        actionName="updateNetworkDeviceSsapSettings"
        className="grid gap-3 md:grid-cols-2"
      >
        <input type="hidden" name="id" value={device.id} />
        <div>
          <Label>{t("ssapHost")}</Label>
          <Input
            name="ssap_host"
            defaultValue={device.ssap_host ?? ""}
            placeholder={t("ssapHostPlaceholder")}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div>
          <Label>{t("jellyfinAppId")}</Label>
          <Input
            name="jellyfin_app_id"
            value={jellyfinId}
            onChange={(e) => setJellyfinId(e.target.value)}
            placeholder={t("jellyfinAppIdPlaceholder")}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" size="sm" className="md:col-span-2 w-fit">
          {t("ssapSaveSettings")}
        </Button>
      </FormAction>

      {apps.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded border border-zinc-200 text-sm dark:border-zinc-700">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {apps.map((app) => (
              <li
                key={app.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{app.title}</span>
                  <span className="ml-2 text-xs text-zinc-500">{app.id}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setJellyfinId(app.id)}
                >
                  {t("ssapUseAsJellyfin")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
