"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createDevice,
  addSensorReading,
  controlDirigeraLight,
  controlHueLight,
  getDirigeraLights,
} from "@/modules/smarthome/actions";
import type { DirigeraLightsResult } from "@/modules/smarthome/actions";
import { IKEA_CHROMATIC_PRESETS } from "@/domain/smarthome/color";
import type { DirigeraLight } from "@/domain/smarthome/types";
import { getWindowRecommendationKey } from "@/lib/smarthome";
import { cn } from "@/lib/utils";
import { Thermometer, Wind, Lightbulb, Camera } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface Device {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: unknown;
}

interface Reading {
  id: string;
  temperature: number | null;
  humidity: number | null;
  airQuality: number | null;
  createdAt: Date;
}

export function SmartHomeClient({
  devices,
  readings,
  dirigera,
}: {
  devices: Device[];
  readings: Reading[];
  dirigera: DirigeraLightsResult;
}) {
  const t = useTranslations("smartHome");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [hueStatus, setHueStatus] = useState<Record<string, string>>({});
  const [ikeaLights, setIkeaLights] = useState<DirigeraLight[]>(dirigera.lights);
  const [ikeaPending, setIkeaPending] = useState<Record<string, boolean>>({});
  const [ikeaError, setIkeaError] = useState<string | null>(null);
  /** Hub nearest-match mislabels close oranges; keep the swatch the user actually picked. */
  const ikeaColorPickRef = useRef<Record<string, string>>({});

  function applyIkeaColorPicks(lights: DirigeraLight[]): DirigeraLight[] {
    return lights.map((light) => {
      const pick = ikeaColorPickRef.current[light.id];
      if (!pick) return light;
      const preset = IKEA_CHROMATIC_PRESETS.find((p) => p.id === pick);
      if (!preset) return light;
      return {
        ...light,
        colorPreset: preset.id,
        colorHex: preset.hex,
        colorTempKelvin: undefined,
      };
    });
  }

  useEffect(() => {
    if (dirigera.configured && !dirigera.error) {
      setIkeaLights(applyIkeaColorPicks(dirigera.lights));
    }
  }, [dirigera]);

  const latest = readings[0];
  const recommendation = latest
    ? t(`recommendations.${getWindowRecommendationKey(latest)}`)
    : t("noReadings");

  const chartData = [...readings].reverse().map((r) => ({
    time: format.dateTime(new Date(r.createdAt), { hour: "2-digit", minute: "2-digit" }),
    temp: r.temperature,
    humidity: r.humidity,
    aqi: r.airQuality,
  }));

  async function toggleLight(deviceId: string, on: boolean) {
    const result = await controlHueLight(deviceId, on);
    setHueStatus((prev) => ({
      ...prev,
      [deviceId]: result.success ? (on ? tc("on") : tc("off")) : result.error || tc("failed"),
    }));
  }

  async function refreshIkeaLights() {
    const fresh = await getDirigeraLights();
    if (!fresh.configured) return;
    if (fresh.error) {
      setIkeaError(fresh.error);
      return;
    }
    setIkeaError(null);
    setIkeaLights(applyIkeaColorPicks(fresh.lights));
  }

  async function handleIkeaToggle(lightId: string, on: boolean) {
    setIkeaError(null);
    setIkeaPending((prev) => ({ ...prev, [lightId]: true }));
    setIkeaLights((prev) =>
      prev.map((light) => (light.id === lightId ? { ...light, isOn: on } : light)),
    );

    const result = await controlDirigeraLight(lightId, on);
    if (result.success) {
      await refreshIkeaLights();
    } else {
      setIkeaError(result.error ?? tc("failed"));
      await refreshIkeaLights();
    }

    setIkeaPending((prev) => {
      const next = { ...prev };
      delete next[lightId];
      return next;
    });
  }

  async function handleIkeaState(
    lightId: string,
    options: {
      brightness?: number;
      colorTempKelvin?: number;
      colorHex?: string;
      colorPreset?: string;
    },
  ) {
    setIkeaError(null);
    setIkeaPending((prev) => ({ ...prev, [lightId]: true }));

    if (options.colorTempKelvin != null) {
      delete ikeaColorPickRef.current[lightId];
    }
    if (options.colorPreset) {
      ikeaColorPickRef.current[lightId] = options.colorPreset;
      const preset = IKEA_CHROMATIC_PRESETS.find((p) => p.id === options.colorPreset);
      if (preset) {
        setIkeaLights((prev) =>
          prev.map((light) =>
            light.id === lightId
              ? {
                  ...light,
                  isOn: true,
                  colorPreset: preset.id,
                  colorHex: preset.hex,
                  colorTempKelvin: undefined,
                }
              : light,
          ),
        );
      }
    }

    const result = await controlDirigeraLight(lightId, true, options);
    if (!result.success) {
      if (options.colorPreset) {
        delete ikeaColorPickRef.current[lightId];
      }
      setIkeaError(result.error ?? tc("failed"));
    }
    await refreshIkeaLights();

    setIkeaPending((prev) => {
      const next = { ...prev };
      delete next[lightId];
      return next;
    });
  }

  function kelvinBounds(light: DirigeraLight): { min: number; max: number } {
    if (light.colorTempMin != null && light.colorTempMax != null) {
      return {
        min: Math.min(light.colorTempMin, light.colorTempMax),
        max: Math.max(light.colorTempMin, light.colorTempMax),
      };
    }
    return { min: 2200, max: 4000 };
  }

  const lights = devices.filter((d) => d.type === "LIGHT");
  const cameras = devices.filter((d) => d.type === "CAMERA");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="flex items-center gap-3 p-4">
          <Wind className="h-5 w-5 text-blue-600" />
          <p className="text-sm">{recommendation}</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="sensors">
        <TabsList>
          <TabsTrigger value="sensors">{t("sensors")}</TabsTrigger>
          <TabsTrigger value="ikea-lights">{t("ikeaLights")}</TabsTrigger>
          <TabsTrigger value="lights">{t("hueLights")}</TabsTrigger>
          <TabsTrigger value="cameras">{t("cameras")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sensors" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("logReading")}</CardTitle></CardHeader>
            <CardContent>
              <form action={addSensorReading} className="flex flex-wrap gap-2">
                <Input name="temperature" type="number" step="0.1" placeholder={t("tempPlaceholder")} className="w-28" />
                <Input name="humidity" type="number" step="0.1" placeholder={t("humidityPlaceholder")} className="w-28" />
                <Input name="airQuality" type="number" step="0.1" placeholder={t("aqiPlaceholder")} className="w-28" />
                <Button type="submit">{tc("log")}</Button>
              </form>
            </CardContent>
          </Card>

          {latest && (
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4 text-center">
                <Thermometer className="mx-auto h-5 w-5 text-red-500" />
                <p className="text-2xl font-bold">{latest.temperature ?? tc("emDash")}°</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-zinc-500">{t("humidity")}</p>
                <p className="text-2xl font-bold">{latest.humidity ?? tc("emDash")}%</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-zinc-500">{t("airQuality")}</p>
                <p className="text-2xl font-bold">{latest.airQuality ?? tc("emDash")}</p>
              </CardContent></Card>
            </div>
          )}

          {chartData.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("trends")}</CardTitle></CardHeader>
              <CardContent className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="temp" stroke="#ef4444" dot={false} />
                    <Line type="monotone" dataKey="humidity" stroke="#3b82f6" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ikea-lights" className="space-y-4">
          {!dirigera.configured ? (
            <Card>
              <CardContent className="p-4 text-sm text-zinc-600 dark:text-zinc-400">
                <p>
                  {t.rich("dirigeraSetup", {
                    ip: () => <code className="text-xs">DIRIGERA_IP</code>,
                    token: () => <code className="text-xs">DIRIGERA_TOKEN</code>,
                    env: () => <code className="text-xs">.env</code>,
                    cmd: () => <code className="text-xs">npx dirigera authenticate</code>,
                    doc: () => <code className="text-xs">docs/dirigera-setup.md</code>,
                  })}
                </p>
              </CardContent>
            </Card>
          ) : dirigera.error ? (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
              <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
                {dirigera.error}
              </CardContent>
            </Card>
          ) : dirigera.lights.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-zinc-500">
                {t("noIkeaLights")}
              </CardContent>
            </Card>
          ) : (
            <>
              {ikeaError && (
                <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
                  <CardContent className="p-3 text-sm text-amber-800 dark:text-amber-200">
                    {ikeaError}
                  </CardContent>
                </Card>
              )}
              {ikeaLights.map((light) => {
                const busy = Boolean(ikeaPending[light.id]);
                const disabled = !light.isReachable || busy;
                const { min: kelvinMin, max: kelvinMax } = kelvinBounds(light);
                const kelvinValue = light.colorTempKelvin ?? Math.round((kelvinMin + kelvinMax) / 2);
                const brightnessValue = light.lightLevel ?? 100;
                const colourValue = light.colorHex ?? "#FFFFFF";

                return (
                  <Card key={light.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Lightbulb
                            className={`h-5 w-5 ${light.isOn ? "text-amber-500" : "text-zinc-400"}`}
                          />
                          <div>
                            <span>{light.name}</span>
                            {light.room && (
                              <span className="ml-2 text-xs text-zinc-500">{light.room}</span>
                            )}
                            {!light.isReachable && (
                              <span className="ml-2 text-xs text-amber-600">{t("unreachable")}</span>
                            )}
                          </div>
                        </div>
                        <Switch
                          checked={light.isOn}
                          disabled={disabled}
                          onCheckedChange={(checked) => handleIkeaToggle(light.id, checked)}
                          aria-label={`${light.name} ${light.isOn ? tc("on") : tc("off")}`}
                        />
                      </div>

                      {light.isReachable && light.supportsBrightness && (
                        <label className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="w-28 text-zinc-500">{t("brightness")}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            defaultValue={brightnessValue}
                            key={`${light.id}-bri-${brightnessValue}`}
                            disabled={disabled}
                            className="min-w-[8rem] flex-1"
                            onMouseUp={(e) =>
                              handleIkeaState(light.id, {
                                brightness: Number((e.target as HTMLInputElement).value),
                              })
                            }
                            onTouchEnd={(e) =>
                              handleIkeaState(light.id, {
                                brightness: Number((e.target as HTMLInputElement).value),
                              })
                            }
                          />
                          <span className="w-10 text-right tabular-nums">{brightnessValue}</span>
                        </label>
                      )}

                      {light.isReachable && light.supportsColorTemp && (
                        <label className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="w-28 text-zinc-500">{t("warmth")}</span>
                          <input
                            type="range"
                            min={kelvinMin}
                            max={kelvinMax}
                            step={50}
                            defaultValue={kelvinValue}
                            key={`${light.id}-k-${kelvinValue}`}
                            disabled={disabled}
                            className="min-w-[8rem] flex-1"
                            onMouseUp={(e) =>
                              handleIkeaState(light.id, {
                                colorTempKelvin: Number((e.target as HTMLInputElement).value),
                              })
                            }
                            onTouchEnd={(e) =>
                              handleIkeaState(light.id, {
                                colorTempKelvin: Number((e.target as HTMLInputElement).value),
                              })
                            }
                          />
                          <span className="w-14 text-right tabular-nums">{kelvinValue}</span>
                        </label>
                      )}

                      {light.isReachable && light.supportsColor && (
                        <div className="space-y-2 text-sm">
                          <span className="text-zinc-500">{t("colour")}</span>
                          <div className="flex flex-wrap gap-2">
                            {IKEA_CHROMATIC_PRESETS.map((preset) => {
                              const selected =
                                light.colorPreset === preset.id ||
                                light.colorHex?.toUpperCase() === preset.hex;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  title={preset.name}
                                  disabled={disabled}
                                  aria-label={preset.name}
                                  aria-pressed={selected}
                                  onClick={() =>
                                    void handleIkeaState(light.id, {
                                      colorPreset: preset.id,
                                    })
                                  }
                                  className={cn(
                                    "h-8 w-8 rounded-md border-2 shadow-sm transition disabled:opacity-50",
                                    selected
                                      ? "border-emerald-600 ring-2 ring-emerald-600/40"
                                      : "border-zinc-300 dark:border-zinc-600",
                                  )}
                                  style={{ backgroundColor: preset.hex }}
                                />
                              );
                            })}
                          </div>
                          {(light.colorPreset || colourValue) && (
                            <p className="text-xs text-zinc-500">
                              {IKEA_CHROMATIC_PRESETS.find((p) => p.id === light.colorPreset)
                                ?.name ?? colourValue}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </TabsContent>

        <TabsContent value="lights" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("addHueLight")}</CardTitle></CardHeader>
            <CardContent>
              <form action={createDevice} className="flex gap-2">
                <input type="hidden" name="type" value="LIGHT" />
                <Input name="name" placeholder={t("livingRoomPlaceholder")} required />
                <Input name="config" placeholder='{"lightId": 1}' />
                <Button type="submit">{tc("add")}</Button>
              </form>
            </CardContent>
          </Card>

          {lights.map((light) => (
            <Card key={light.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  <span>{light.name}</span>
                  {hueStatus[light.id] && <span className="text-xs text-zinc-500">{hueStatus[light.id]}</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toggleLight(light.id, true)}>{tc("on")}</Button>
                  <Button size="sm" variant="outline" onClick={() => toggleLight(light.id, false)}>{tc("off")}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="cameras" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("addCamera")}</CardTitle></CardHeader>
            <CardContent>
              <form action={createDevice} className="flex gap-2">
                <input type="hidden" name="type" value="CAMERA" />
                <Input name="name" placeholder={t("frontDoorPlaceholder")} required />
                <Input name="config" placeholder='{"streamUrl": "http://..."}' />
                <Button type="submit">{tc("add")}</Button>
              </form>
            </CardContent>
          </Card>

          {cameras.map((cam) => {
            const config = cam.config as { streamUrl?: string } | null;
            return (
              <Card key={cam.id}>
                <CardContent className="p-4">
                  <p className="mb-2 flex items-center gap-2 font-medium">
                    <Camera className="h-4 w-4" /> {cam.name}
                  </p>
                  {config?.streamUrl ? (
                    <img src={config.streamUrl} alt={cam.name} className="max-h-48 rounded" />
                  ) : (
                    <p className="text-sm text-zinc-500">{t("configureStream")}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
