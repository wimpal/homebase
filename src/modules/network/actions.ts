"use server";

import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import {
  addDeviceLocation,
  addNetworkDevice,
  addNetworkDeviceType,
  getNetworkDevice,
  listDeviceLocations,
  listNetworkDeviceTypes,
  listNetworkDevices,
  renameDeviceLocation,
  restoreNetworkDevice,
  retireNetworkDevice,
  updateNetworkDevice,
  type CatalogueLocation,
  type CatalogueType,
  type NetworkDeviceDetail,
} from "@/domain/network";
import { isDomainError } from "@/domain/error";
import {
  fromDomainError,
  okResult,
  type ActionResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function adminNetwork() {
  const ctx = await requireAdmin();
  await requireModule(ctx.householdId, ModuleId.HOME_NETWORK);
  return ctx;
}

export async function getNetworkPageData(includeRetired: boolean): Promise<{
  devices: NetworkDeviceDetail[];
  types: CatalogueType[];
  locations: CatalogueLocation[];
}> {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOME_NETWORK);

  const [devicesResult, types, locations] = await Promise.all([
    listNetworkDevices(householdId, { include_retired: includeRetired }),
    listNetworkDeviceTypes(householdId),
    listDeviceLocations(householdId),
  ]);

  const devices = isDomainError(devicesResult) ? [] : devicesResult;
  return { devices, types, locations };
}

export async function enrollNetworkDeviceAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const result = await addNetworkDevice(householdId, {
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    location: String(formData.get("location") ?? ""),
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

export async function updateNetworkDeviceAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const notesRaw = formData.get("notes");
  const result = await updateNetworkDevice(householdId, {
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? "") || undefined,
    type: String(formData.get("type") ?? "") || undefined,
    location: String(formData.get("location") ?? "") || undefined,
    notes: notesRaw === null ? undefined : String(notesRaw),
  });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

export async function retireNetworkDeviceAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const result = await retireNetworkDevice(
    householdId,
    String(formData.get("id") ?? ""),
  );
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

export async function restoreNetworkDeviceAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const result = await restoreNetworkDevice(
    householdId,
    String(formData.get("id") ?? ""),
  );
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

export async function addNetworkDeviceTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const result = await addNetworkDeviceType(
    householdId,
    String(formData.get("name") ?? ""),
  );
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

export async function addDeviceLocationAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const result = await addDeviceLocation(
    householdId,
    String(formData.get("name") ?? ""),
  );
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

export async function renameDeviceLocationAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const result = await renameDeviceLocation(
    householdId,
    String(formData.get("id") ?? ""),
    String(formData.get("name") ?? ""),
  );
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}

/** Used by page for optional detail peek — keep household-scoped. */
export async function getNetworkDeviceAction(
  id: string,
): Promise<NetworkDeviceDetail | null> {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOME_NETWORK);
  const result = await getNetworkDevice(householdId, id);
  if (isDomainError(result)) return null;
  return result;
}
