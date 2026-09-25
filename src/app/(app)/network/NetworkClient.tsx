"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { FormAction } from "@/components/ui/form-action";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addDeviceLocationAction,
  addNetworkDeviceTypeAction,
  enrollNetworkDeviceAction,
  renameDeviceLocationAction,
  restoreNetworkDeviceAction,
  retireNetworkDeviceAction,
  updateNetworkDeviceAction,
} from "@/modules/network/actions";
import type {
  CatalogueLocation,
  CatalogueType,
  NetworkDeviceUiRow,
} from "@/domain/network";
import { NetworkScanPanel } from "./NetworkScanPanel";
import { NetworkTvSsapPanel } from "./NetworkTvSsapPanel";

type Props = {
  devices: NetworkDeviceUiRow[];
  types: CatalogueType[];
  locations: CatalogueLocation[];
  isAdmin: boolean;
  includeRetired: boolean;
};

export function NetworkClient({
  devices,
  types,
  locations,
  isAdmin,
  includeRetired,
}: Props) {
  const t = useTranslations("network");
  const tc = useTranslations("common");
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-zinc-500">{t("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={includeRetired ? "/network" : "/network?retired=1"}>
            {includeRetired ? t("hideRetired") : t("showRetired")}
          </Link>
        </Button>
      </div>

      {!isAdmin && (
        <p className="text-sm text-zinc-500">{t("adminOnly")}</p>
      )}

      {isAdmin && <NetworkScanPanel types={types} locations={locations} />}

      {isAdmin && (
        <CollapsibleCreate
          openLabel={t("enroll")}
          cancelLabel={tc("cancelAdd")}
          defaultOpen={devices.length === 0}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("enroll")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormAction
                action={enrollNetworkDeviceAction}
                actionName="enrollNetworkDevice"
                className="grid gap-3 md:grid-cols-2"
              >
                <div>
                  <Label>{t("name")}</Label>
                  <Input name="name" required maxLength={200} />
                </div>
                <div>
                  <Label>{t("type")}</Label>
                  <select
                    name="type"
                    required
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {types.map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t("location")}</Label>
                  <select
                    name="location"
                    required
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                  <div>
                    <Label>{t("mac")}</Label>
                    <Input
                      name="mac"
                      placeholder={t("macPlaceholder")}
                      maxLength={17}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input
                      type="checkbox"
                      id="enroll-wake"
                      name="wake_allowed"
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <Label htmlFor="enroll-wake" className="font-normal">
                      {t("wakeAllowlist")}
                    </Label>
                  </div>
                <div>
                  <Label>{t("notes")}</Label>
                  <Input
                    name="notes"
                    placeholder={t("notesPlaceholder")}
                    maxLength={500}
                  />
                </div>
                <Button type="submit">{t("enrollBtn")}</Button>
              </FormAction>
            </CardContent>
          </Card>
        </CollapsibleCreate>
      )}

      {devices.length === 0 ? (
        <EmptyState message={t("noDevices")} />
      ) : (
        devices.map((d) => (
          <Card key={d.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <Network className="h-4 w-4" />
                    {d.name}
                    {d.retired_at && (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {t("retired")}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {d.type.name} · {d.location.name}
                    {d.mac_address ? ` · ${d.mac_address}` : ""}
                    {d.wake_allowed ? ` · ${t("wakeCapableBadge")}` : ""}
                    {d.ssap_paired ? ` · ${t("ssapPairedBadge")}` : ""}
                    {d.last_seen_ip ? ` · ${d.last_seen_ip}` : ""}
                  </p>
                  {d.notes && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {d.notes}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    {!d.retired_at && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditingId(editingId === d.id ? null : d.id)
                          }
                        >
                          {t("edit")}
                        </Button>
                        <ConfirmFormAction
                          action={retireNetworkDeviceAction}
                          actionName="retireNetworkDevice"
                          message={t("confirmRetire")}
                        >
                          <input type="hidden" name="id" value={d.id} />
                          <Button type="submit" variant="outline" size="sm">
                            {t("retire")}
                          </Button>
                        </ConfirmFormAction>
                      </>
                    )}
                    {d.retired_at && (
                      <FormAction
                        action={restoreNetworkDeviceAction}
                        actionName="restoreNetworkDevice"
                      >
                        <input type="hidden" name="id" value={d.id} />
                        <Button type="submit" size="sm">
                          {t("restore")}
                        </Button>
                      </FormAction>
                    )}
                  </div>
                )}
              </div>

              {isAdmin && editingId === d.id && !d.retired_at && (
                <FormAction
                  action={updateNetworkDeviceAction}
                  actionName="updateNetworkDevice"
                  onSuccess={() => setEditingId(null)}
                  className="grid gap-3 border-t border-zinc-100 pt-3 md:grid-cols-2 dark:border-zinc-800"
                  confirmIf={(fd) => {
                    const mac = String(fd.get("mac") ?? "").trim();
                    const wake = fd.get("wake_allowed") === "on";
                    if (d.mac_address && !mac) return t("confirmClearMac");
                    if (d.wake_allowed && !wake) return t("confirmClearWake");
                    return null;
                  }}
                >
                  <input type="hidden" name="id" value={d.id} />
                  <div>
                    <Label>{t("name")}</Label>
                    <Input
                      name="name"
                      defaultValue={d.name}
                      required
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <Label>{t("type")}</Label>
                    <select
                      name="type"
                      defaultValue={d.type.id}
                      className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {types.map((ty) => (
                        <option key={ty.id} value={ty.id}>
                          {ty.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("location")}</Label>
                    <select
                      name="location"
                      defaultValue={d.location.id}
                      className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("mac")}</Label>
                    <Input
                      name="mac"
                      defaultValue={d.mac_address ?? ""}
                      placeholder={t("macPlaceholder")}
                      maxLength={17}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <Label>{t("notes")}</Label>
                    <Input
                      name="notes"
                      defaultValue={d.notes ?? ""}
                      maxLength={500}
                    />
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input
                      type="checkbox"
                      id={`wake-${d.id}`}
                      name="wake_allowed"
                      defaultChecked={d.wake_allowed}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <Label htmlFor={`wake-${d.id}`} className="font-normal">
                      {t("wakeAllowlist")}
                    </Label>
                  </div>
                  <p className="text-xs text-zinc-500 md:col-span-2">
                    {t("wakeAllowlistHint")}
                  </p>
                  <Button type="submit">{t("saveChanges")}</Button>
                </FormAction>
              )}
              {isAdmin && editingId === d.id && !d.retired_at && (
                <NetworkTvSsapPanel device={d} />
              )}
            </CardContent>
          </Card>
        ))
      )}

      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("manageTypes")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                {types.map((ty) => (
                  <li key={ty.id} className="flex justify-between gap-2">
                    <span>{ty.name}</span>
                    {ty.isSystem && (
                      <span className="text-xs text-zinc-400">{t("system")}</span>
                    )}
                  </li>
                ))}
              </ul>
              <FormAction
                action={addNetworkDeviceTypeAction}
                actionName="addNetworkDeviceType"
                className="flex gap-2"
              >
                <Input
                  name="name"
                  placeholder={t("typeName")}
                  required
                  maxLength={80}
                />
                <Button type="submit" size="sm">
                  {t("addType")}
                </Button>
              </FormAction>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("manageLocations")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm">
                {locations.map((loc) => (
                  <li key={loc.id}>
                    {loc.isReserved ? (
                      <div className="flex justify-between gap-2">
                        <span>{loc.name}</span>
                        <span className="text-xs text-zinc-400">
                          {t("reserved")}
                        </span>
                      </div>
                    ) : (
                      <FormAction
                        action={renameDeviceLocationAction}
                        actionName="renameDeviceLocation"
                        className="flex gap-2"
                      >
                        <input type="hidden" name="id" value={loc.id} />
                        <Input
                          name="name"
                          defaultValue={loc.name}
                          required
                          maxLength={80}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          {t("rename")}
                        </Button>
                      </FormAction>
                    )}
                  </li>
                ))}
              </ul>
              <FormAction
                action={addDeviceLocationAction}
                actionName="addDeviceLocation"
                className="flex gap-2"
              >
                <Input
                  name="name"
                  placeholder={t("locationName")}
                  required
                  maxLength={80}
                />
                <Button type="submit" size="sm">
                  {t("addLocation")}
                </Button>
              </FormAction>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
