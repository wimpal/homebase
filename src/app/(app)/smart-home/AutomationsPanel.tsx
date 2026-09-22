"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DirigeraLight } from "@/domain/smarthome/types";
import type { DirigeraEdgeSensor } from "@/domain/smarthome";
import type {
  AutomationListItem,
  AutomationWriteResult,
  DirigeraEdgeSensorsResult,
  DirigeraLightsResult,
} from "@/modules/smarthome/actions";
import {
  applyAutomationActionUi,
  createAutomationAction,
  deleteAutomationAction,
  setAutomationEnabledAction,
  updateAutomationAction,
} from "@/modules/smarthome/actions";

const DAY_KEYS = [
  "dayMon",
  "dayTue",
  "dayWed",
  "dayThu",
  "dayFri",
  "daySat",
  "daySun",
] as const;
/** ISO weekday values matching DAY_KEYS order (Mon=1 … Sun=7). */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;

function lightLabel(
  deviceId: string,
  byId: Map<string, DirigeraLight>,
  unavailable: string,
): string {
  const light = byId.get(deviceId);
  if (!light) {
    const short =
      deviceId.length > 12 ? `${deviceId.slice(0, 8)}…` : deviceId;
    return `${short} (${unavailable})`;
  }
  return light.room ? `${light.name} (${light.room})` : light.name;
}

function sensorLabel(
  deviceId: string | null,
  byId: Map<string, DirigeraEdgeSensor>,
  unavailable: string,
): string {
  if (!deviceId) return unavailable;
  const sensor = byId.get(deviceId);
  if (!sensor) {
    const short =
      deviceId.length > 12 ? `${deviceId.slice(0, 8)}…` : deviceId;
    return `${short} (${unavailable})`;
  }
  return sensor.room ? `${sensor.name} (${sensor.room})` : sensor.name;
}

function AutomationFormFields({
  lights,
  sensors,
  defaults,
  idPrefix,
}: {
  lights: DirigeraLight[];
  sensors: DirigeraEdgeSensor[];
  defaults?: AutomationListItem;
  idPrefix: string;
}) {
  const t = useTranslations("smartHome");
  const tc = useTranslations("common");
  const [triggerKind, setTriggerKind] = useState<"SCHEDULE" | "SENSOR_EDGE">(
    defaults?.triggerKind ?? "SCHEDULE",
  );
  const [action, setAction] = useState<"on" | "off" | "toggle">(() => {
    if (defaults?.toggle) return "toggle";
    if (defaults?.on === false) return "off";
    return "on";
  });
  const [polarity, setPolarity] = useState<"rising" | "falling">(
    defaults?.sensorEdgePolarity === "falling" ? "falling" : "rising",
  );
  const [sensorId, setSensorId] = useState(
    defaults?.sensorDirigeraDeviceId ?? sensors[0]?.id ?? "",
  );
  const [sunsetLinkEnabled, setSunsetLinkEnabled] = useState(
    defaults?.sunsetLinkEnabled ?? false,
  );
  const defaultDays = new Set(defaults?.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7]);
  const defaultTargets = new Set(
    defaults?.targets.map((x) => x.dirigeraDeviceId) ?? [],
  );

  const selectedSensor = sensors.find((s) => s.id === sensorId);
  const edgeAttr =
    selectedSensor?.edgeAttribute ??
    defaults?.sensorEdgeAttribute ??
    "isOpen";

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{tc("name")}</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={100}
          defaultValue={defaults?.name}
          placeholder={
            triggerKind === "SENSOR_EDGE"
              ? t("automationSensorNamePlaceholder")
              : t("automationNamePlaceholder")
          }
        />
      </div>

      <div className="md:col-span-2">
        <Label htmlFor={`${idPrefix}-trigger`}>{t("triggerKind")}</Label>
        <select
          id={`${idPrefix}-trigger`}
          name="triggerKind"
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          value={triggerKind}
          onChange={(e) => {
            const next =
              e.target.value === "SENSOR_EDGE" ? "SENSOR_EDGE" : "SCHEDULE";
            setTriggerKind(next);
            if (next === "SCHEDULE" && action === "toggle") {
              setAction("on");
            }
            if (next === "SENSOR_EDGE") {
              setSunsetLinkEnabled(false);
            }
          }}
        >
          <option value="SCHEDULE">{t("triggerSchedule")}</option>
          <option value="SENSOR_EDGE">{t("triggerSensor")}</option>
        </select>
      </div>

      {triggerKind === "SCHEDULE" ? (
        <>
          <div>
            <Label htmlFor={`${idPrefix}-time`}>{t("time")}</Label>
            <Input
              id={`${idPrefix}-time`}
              name="timeLocal"
              type="time"
              required
              defaultValue={defaults?.timeLocal ?? "21:00"}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-action`}>{t("action")}</Label>
            <select
              id={`${idPrefix}-action`}
              name="action"
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              value={action === "toggle" ? "on" : action}
              onChange={(e) =>
                setAction(e.target.value === "off" ? "off" : "on")
              }
            >
              <option value="on">{t("turnOn")}</option>
              <option value="off">{t("turnOff")}</option>
            </select>
          </div>
          {action === "on" ? (
            <>
              <div>
                <Label htmlFor={`${idPrefix}-brightness`}>
                  {t("brightness")}
                </Label>
                <Input
                  id={`${idPrefix}-brightness`}
                  name="brightness"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0–100"
                  defaultValue={defaults?.brightness ?? undefined}
                />
              </div>
              <div>
                <Label htmlFor={`${idPrefix}-warmth`}>{t("warmth")}</Label>
                <Input
                  id={`${idPrefix}-warmth`}
                  name="colorTempKelvin"
                  type="number"
                  min={1}
                  placeholder="e.g. 2700"
                  defaultValue={defaults?.colorTempKelvin ?? undefined}
                />
              </div>
            </>
          ) : null}
          <div className="md:col-span-2">
            <Label>{t("days")}</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {DAY_VALUES.map((day, i) => (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="daysOfWeek"
                    value={day}
                    defaultChecked={defaultDays.has(day)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {t(DAY_KEYS[i])}
                </label>
              ))}
            </div>
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
                <Label htmlFor={`${idPrefix}-minutes-before`}>
                  {t("minutesBeforeSunset")}
                </Label>
                <Input
                  id={`${idPrefix}-minutes-before`}
                  name="minutesBeforeSunset"
                  type="number"
                  min={0}
                  max={180}
                  required
                  defaultValue={defaults?.minutesBeforeSunset ?? 30}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="sensorEdgeAttribute" value={edgeAttr} />
          <div className="md:col-span-2">
            <Label htmlFor={`${idPrefix}-sensor`}>{t("sensor")}</Label>
            {sensors.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">{t("noEdgeSensors")}</p>
            ) : (
              <select
                id={`${idPrefix}-sensor`}
                name="sensorDirigeraDeviceId"
                required
                className="mt-1 flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
              >
                {sensors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.room ? `${s.name} (${s.room})` : s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {action === "toggle" ? (
            <input type="hidden" name="sensorEdgePolarity" value="rising" />
          ) : (
            <div>
              <Label htmlFor={`${idPrefix}-polarity`}>{t("sensorEdge")}</Label>
              <select
                id={`${idPrefix}-polarity`}
                name="sensorEdgePolarity"
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                value={polarity}
                onChange={(e) =>
                  setPolarity(
                    e.target.value === "falling" ? "falling" : "rising",
                  )
                }
              >
                <option value="rising">
                  {selectedSensor?.deviceType === "motionSensor"
                    ? t("edgeDetects")
                    : t("edgeOpens")}
                </option>
                <option value="falling">
                  {selectedSensor?.deviceType === "motionSensor"
                    ? t("edgeClears")
                    : t("edgeCloses")}
                </option>
              </select>
            </div>
          )}
          <div>
            <Label htmlFor={`${idPrefix}-action`}>{t("action")}</Label>
            <select
              id={`${idPrefix}-action`}
              name="action"
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              value={action}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "toggle") setAction("toggle");
                else if (v === "off") setAction("off");
                else setAction("on");
              }}
            >
              <option value="on">{t("turnOn")}</option>
              <option value="off">{t("turnOff")}</option>
              <option value="toggle">{t("toggle")}</option>
            </select>
          </div>
          <p className="md:col-span-2 text-xs text-zinc-500">
            {action === "toggle" ? t("toggleLeaveHint") : t("sensorRuleHint")}
          </p>
          {action === "on" || action === "toggle" ? (
            <>
              <div>
                <Label htmlFor={`${idPrefix}-brightness`}>
                  {t("brightness")}
                </Label>
                <Input
                  id={`${idPrefix}-brightness`}
                  name="brightness"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0–100"
                  defaultValue={defaults?.brightness ?? undefined}
                />
              </div>
              <div>
                <Label htmlFor={`${idPrefix}-warmth`}>{t("warmth")}</Label>
                <Input
                  id={`${idPrefix}-warmth`}
                  name="colorTempKelvin"
                  type="number"
                  min={1}
                  placeholder="e.g. 2700"
                  defaultValue={defaults?.colorTempKelvin ?? undefined}
                />
              </div>
            </>
          ) : null}
        </>
      )}

      <div>
        <Label htmlFor={`${idPrefix}-active-from`}>{t("activeFrom")}</Label>
        <Input
          id={`${idPrefix}-active-from`}
          name="activeFromLocal"
          type="time"
          defaultValue={defaults?.activeFromLocal ?? undefined}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-active-until`}>{t("activeUntil")}</Label>
        <Input
          id={`${idPrefix}-active-until`}
          name="activeUntilLocal"
          type="time"
          defaultValue={defaults?.activeUntilLocal ?? undefined}
        />
      </div>
      <p className="md:col-span-2 text-xs text-zinc-500">
        {t("activeHoursHint")}
      </p>

      <div className="md:col-span-2">
        <Label>{t("targets")}</Label>
        {lights.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">{t("noIkeaLights")}</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {lights.map((light) => (
              <label
                key={light.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="targetDeviceIds"
                  value={light.id}
                  defaultChecked={defaultTargets.has(light.id)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                <span>
                  {light.name}
                  {light.room ? (
                    <span className="text-zinc-500"> ({light.room})</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AutomationsPanel({
  automations,
  dirigera,
  edgeSensors,
}: {
  automations: AutomationListItem[];
  dirigera: DirigeraLightsResult;
  edgeSensors: DirigeraEdgeSensorsResult;
}) {
  const t = useTranslations("smartHome");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [saveErrorDialog, setSaveErrorDialog] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const lights = dirigera.configured && !dirigera.error ? dirigera.lights : [];
  const sensors =
    edgeSensors.configured && !edgeSensors.error ? edgeSensors.sensors : [];
  const lightById = useMemo(
    () => new Map(lights.map((l) => [l.id, l])),
    [lights],
  );
  const sensorById = useMemo(
    () => new Map(sensors.map((s) => [s.id, s])),
    [sensors],
  );

  function messageForWriteResult(result: AutomationWriteResult): string {
    if (result.ok) return "";
    if (result.reason === "active_window_incomplete") {
      return t("activeWindowIncomplete");
    }
    return t("saveFailedGeneric");
  }

  async function handleCreate(formData: FormData) {
    const result = await createAutomationAction(formData);
    if (!result.ok) {
      setSaveErrorDialog(messageForWriteResult(result));
    }
  }

  async function handleUpdate(formData: FormData) {
    const result = await updateAutomationAction(formData);
    if (!result.ok) {
      setSaveErrorDialog(messageForWriteResult(result));
      return;
    }
    setEditingId(null);
  }

  function daySummary(days: number[]): string {
    if (days.length === 7) return t("everyDay");
    const sorted = [...days].sort((a, b) => a - b);
    return sorted.map((d) => t(DAY_KEYS[d - 1])).join(", ");
  }

  function summaryLine(rule: AutomationListItem): string {
    const targets = rule.targets
      .map((x) => lightLabel(x.dirigeraDeviceId, lightById, t("unavailable")))
      .join(", ");
    const activeHours =
      rule.activeFromLocal && rule.activeUntilLocal
        ? t("activeHoursSummary", {
            from: rule.activeFromLocal,
            until: rule.activeUntilLocal,
          })
        : null;
    if (rule.triggerKind === "SENSOR_EDGE") {
      const sensor = sensorLabel(
        rule.sensorDirigeraDeviceId,
        sensorById,
        t("unavailable"),
      );
      const isMotion = rule.sensorEdgeAttribute === "isDetected";
      const edge =
        rule.sensorEdgePolarity === "falling"
          ? isMotion
            ? t("edgeClears")
            : t("edgeCloses")
          : isMotion
            ? t("edgeDetects")
            : t("edgeOpens");
      const action = rule.toggle
        ? t("toggleLeaveSummary")
        : rule.on
          ? t("turnOn")
          : t("turnOff");
      const base = t("sensorRuleSummary", {
        sensor,
        edge: rule.toggle ? t("toggleLeaveEdge") : edge,
        action,
        targets: targets || t("noTargets"),
      });
      return activeHours ? `${base} · ${activeHours}` : base;
    }
    const action = rule.on ? t("turnOn") : t("turnOff");
    let base = t("ruleSummary", {
      time: rule.timeLocal ?? "—",
      days: daySummary(rule.daysOfWeek),
      action,
      targets: targets || t("noTargets"),
    });
    if (rule.sunsetLinkEnabled) {
      base = `${base} · ${t("sunsetLinkSummary", {
        minutes: rule.minutesBeforeSunset ?? 0,
      })}`;
    }
    return activeHours ? `${base} · ${activeHours}` : base;
  }

  function toggleEnabled(rule: AutomationListItem, enabled: boolean) {
    setError(null);
    setPendingId(rule.id);
    startTransition(async () => {
      try {
        await setAutomationEnabledAction(rule.id, enabled);
      } catch (e) {
        setError(e instanceof Error ? e.message : tc("failed"));
      } finally {
        setPendingId(null);
      }
    });
  }

  function runNow(rule: AutomationListItem) {
    setError(null);
    setRunMessage(null);
    setPendingId(rule.id);
    startTransition(async () => {
      try {
        const result = await applyAutomationActionUi(rule.id);
        if (!result.success) {
          setError(result.error);
        } else {
          setRunMessage(
            result.failed > 0 ? result.lastRunResult : t("runNowOk"),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : tc("failed"));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t("automationsSubtitle")}</p>

      {!dirigera.configured ? (
        <Card>
          <CardContent className="p-4 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              {t.rich("dirigeraSetup", {
                ip: () => <code className="text-xs">DIRIGERA_IP</code>,
                token: () => <code className="text-xs">DIRIGERA_TOKEN</code>,
                env: () => <code className="text-xs">.env</code>,
                cmd: () => (
                  <code className="text-xs">npx dirigera authenticate</code>
                ),
                doc: () => (
                  <code className="text-xs">docs/dirigera-setup.md</code>
                ),
              })}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {dirigera.configured && dirigera.error ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
            {dirigera.error}
          </CardContent>
        </Card>
      ) : null}

      {edgeSensors.configured && edgeSensors.error ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
            {edgeSensors.error}
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {runMessage ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {runMessage}
        </p>
      ) : null}

      <Dialog
        open={saveErrorDialog !== null}
        onOpenChange={(open) => {
          if (!open) setSaveErrorDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveFailedTitle")}</DialogTitle>
            <DialogDescription>{saveErrorDialog}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setSaveErrorDialog(null)}>
              {t("dialogOk")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CollapsibleCreate
        openLabel={t("createAutomation")}
        cancelLabel={tc("cancel")}
        defaultOpen={automations.length === 0 && lights.length > 0}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createAutomation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreate} className="space-y-4">
              <AutomationFormFields
                lights={lights}
                sensors={sensors}
                idPrefix="create"
              />
              <Button type="submit" disabled={lights.length === 0}>
                {tc("add")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </CollapsibleCreate>

      {automations.length === 0 ? (
        <EmptyState message={t("noAutomations")} />
      ) : null}

      {automations.map((rule) => {
        const busy = pendingId === rule.id;
        const editing = editingId === rule.id;
        const lastRunLabel = rule.lastRunAt
          ? format.dateTime(new Date(rule.lastRunAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Amsterdam",
            })
          : t("neverRun");

        return (
          <Card
            key={rule.id}
            className={!rule.enabled ? "opacity-70" : undefined}
          >
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-sm text-zinc-500">{summaryLine(rule)}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {t("lastRun")}: {lastRunLabel}
                    {rule.lastRunResult ? ` — ${rule.lastRunResult}` : null}
                  </p>
                  {rule.sunsetLinkEnabled &&
                  rule.sunsetLastAdjustResult?.startsWith("failed:") ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {t("sunsetAdjustFailed", {
                        detail: rule.sunsetLastAdjustResult,
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        toggleEnabled(rule, checked)
                      }
                    />
                    <span className="text-xs text-zinc-500">
                      {rule.enabled ? t("enabled") : t("disabled")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !rule.enabled}
                    onClick={() => runNow(rule)}
                  >
                    {t("runNow")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(editing ? null : rule.id)}
                  >
                    {editing ? tc("cancel") : tc("edit")}
                  </Button>
                  <ConfirmForm
                    action={deleteAutomationAction}
                    message={t("confirmDeleteAutomation")}
                  >
                    <input type="hidden" name="id" value={rule.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      {tc("delete")}
                    </Button>
                  </ConfirmForm>
                </div>
              </div>

              {editing ? (
                <form
                  action={handleUpdate}
                  className="space-y-4 border-t border-zinc-100 pt-3 dark:border-zinc-800"
                >
                  <input type="hidden" name="id" value={rule.id} />
                  <AutomationFormFields
                    lights={lights}
                    sensors={sensors}
                    defaults={rule}
                    idPrefix={`edit-${rule.id}`}
                  />
                  <Button type="submit">{tc("save")}</Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
