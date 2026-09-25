"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Clapperboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormAction } from "@/components/ui/form-action";
import { EmptyState } from "@/components/ui/empty-state";
import { saveCinemaSettingsAction } from "@/modules/protocols/actions";
import type { CinemaSettingsDto } from "@/domain/protocols";

type LightOpt = { id: string; name: string; room?: string };

type Props = {
  settings: CinemaSettingsDto;
  tvOptions: { id: string; name: string }[];
  locations: { id: string; name: string; slug: string }[];
  lights: LightOpt[];
  dirigeraRooms: string[];
  isAdmin: boolean;
};

export function ProtocolsClient({
  settings,
  tvOptions,
  locations,
  lights,
  dirigeraRooms,
  isAdmin,
}: Props) {
  const t = useTranslations("protocols");
  const tc = useTranslations("common");

  const [sunsetLinkEnabled, setSunsetLinkEnabled] = useState(
    settings.sunsetLinkEnabled,
  );
  const [roomName, setRoomName] = useState(settings.dirigeraRoomName ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(settings.selectedLightIds),
  );

  const filteredLights = useMemo(() => {
    const room = roomName.trim();
    if (!room) return lights;
    return lights.filter(
      (l) => (l.room ?? "").trim().toLowerCase() === room.toLowerCase(),
    );
  }, [lights, roomName]);

  function toggleLight(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      {!isAdmin && (
        <p className="text-sm text-zinc-500">{t("adminOnly")}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clapperboard className="h-4 w-4" />
            {t("cinemaTitle")}
          </CardTitle>
          <p className="text-sm text-zinc-500">{t("cinemaHint")}</p>
        </CardHeader>
        <CardContent>
          {!isAdmin ? (
            <CinemaReadOnly settings={settings} t={t} />
          ) : tvOptions.length === 0 && lights.length === 0 ? (
            <EmptyState message={t("emptyHint")} />
          ) : (
            <FormAction
              action={saveCinemaSettingsAction}
              actionName="saveCinemaSettings"
              className="grid gap-4 md:grid-cols-2"
            >
              <div className="md:col-span-2">
                <Label htmlFor="networkDeviceId">{t("tv")}</Label>
                <select
                  id="networkDeviceId"
                  name="networkDeviceId"
                  defaultValue={settings.networkDeviceId ?? ""}
                  className="mt-1 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="">{t("tvNone")}</option>
                  {tvOptions.map((tv) => (
                    <option key={tv.id} value={tv.id}>
                      {tv.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">{t("tvHint")}</p>
              </div>

              <div>
                <Label htmlFor="deviceLocationId">{t("deviceLocation")}</Label>
                <select
                  id="deviceLocationId"
                  name="deviceLocationId"
                  defaultValue={settings.deviceLocationId ?? ""}
                  className="mt-1 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="">{t("mapNone")}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="dirigeraRoomName">{t("dirigeraRoom")}</Label>
                <select
                  id="dirigeraRoomName"
                  name="dirigeraRoomName"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="">{t("mapNone")}</option>
                  {dirigeraRooms.map((room) => (
                    <option key={room} value={room}>
                      {room}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">{t("mapHint")}</p>
              </div>

              <div>
                <Label htmlFor="dimBrightness">{t("dim")}</Label>
                <Input
                  id="dimBrightness"
                  name="dimBrightness"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={settings.dimBrightness}
                  required
                />
              </div>

              <div>
                <Label htmlFor="cutoffHhMm">{t("cutoff")}</Label>
                <Input
                  id="cutoffHhMm"
                  name="cutoffHhMm"
                  type="time"
                  defaultValue={settings.cutoffHhMm}
                  required
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {t("cutoffHint", { timezone: settings.timezone })}
                </p>
              </div>

              <div className="md:col-span-2 space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <input
                  type="hidden"
                  name="sunsetLinkEnabled"
                  value={sunsetLinkEnabled ? "true" : "false"}
                />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t("sunsetLink")}</p>
                    <p className="text-xs text-zinc-500">{t("sunsetLinkHint")}</p>
                  </div>
                  <Switch
                    checked={sunsetLinkEnabled}
                    onCheckedChange={setSunsetLinkEnabled}
                    aria-label={t("sunsetLink")}
                  />
                </div>
                {sunsetLinkEnabled ? (
                  <div>
                    <Label htmlFor="minutesBeforeSunset">
                      {t("minutesBeforeSunset")}
                    </Label>
                    <Input
                      id="minutesBeforeSunset"
                      name="minutesBeforeSunset"
                      type="number"
                      min={0}
                      max={180}
                      required
                      defaultValue={settings.minutesBeforeSunset ?? 30}
                    />
                  </div>
                ) : null}
                {settings.sunsetLastAdjustResult?.startsWith("failed:") ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {t("sunsetAdjustFailed", {
                      detail: settings.sunsetLastAdjustResult,
                    })}
                  </p>
                ) : settings.sunsetLastAdjustResult?.startsWith("ok:") ? (
                  <p className="text-xs text-zinc-500">
                    {t("sunsetAdjustOk", {
                      detail: settings.sunsetLastAdjustResult,
                    })}
                  </p>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <Label>{t("lamps")}</Label>
                <p className="mb-2 text-xs text-zinc-500">{t("lampsHint")}</p>
                {filteredLights.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t("noLamps")}</p>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                    {filteredLights.map((light) => (
                      <li key={light.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="selectedLightIds"
                          value={light.id}
                          checked={selected.has(light.id)}
                          onChange={() => toggleLight(light.id)}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        <span className="text-sm">
                          {light.name}
                          {light.room ? (
                            <span className="text-zinc-500"> · {light.room}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Keep selected lamps outside filtered room so they still submit */}
                {[...selected]
                  .filter((id) => !filteredLights.some((l) => l.id === id))
                  .map((id) => (
                    <input
                      key={`hidden-${id}`}
                      type="hidden"
                      name="selectedLightIds"
                      value={id}
                    />
                  ))}
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {tc("save")}
                </button>
              </div>
            </FormAction>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CinemaReadOnly({
  settings,
  t,
}: {
  settings: CinemaSettingsDto;
  t: ReturnType<typeof useTranslations<"protocols">>;
}) {
  return (
    <dl className="grid gap-3 text-sm md:grid-cols-2">
      <div>
        <dt className="text-zinc-500">{t("tv")}</dt>
        <dd>{settings.networkDeviceId ?? t("tvNone")}</dd>
      </div>
      <div>
        <dt className="text-zinc-500">{t("dim")}</dt>
        <dd>{settings.dimBrightness}</dd>
      </div>
      <div>
        <dt className="text-zinc-500">{t("cutoff")}</dt>
        <dd>
          {settings.cutoffHhMm} ({settings.timezone})
        </dd>
      </div>
      <div>
        <dt className="text-zinc-500">{t("lamps")}</dt>
        <dd>{settings.selectedLightIds.length}</dd>
      </div>
    </dl>
  );
}
