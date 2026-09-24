"use server";

import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import {
  addDeviceLocation,
  addNetworkDevice,
  addNetworkDeviceType,
  cancelScanJob,
  getNetworkDevice,
  getScanJob,
  listDeviceLocations,
  listNetworkDeviceTypes,
  listNetworkDevicesForUi,
  renameDeviceLocation,
  restoreNetworkDevice,
  retireNetworkDevice,
  startNetworkScan,
  updateNetworkDevice,
  type CatalogueLocation,
  type CatalogueType,
  type NetworkDeviceDetail,
  type NetworkDeviceUiRow,
  type ScanJobSnapshot,
} from "@/domain/network";
import { isDomainError } from "@/domain/error";
import {
  failResult,
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
  devices: NetworkDeviceUiRow[];
  types: CatalogueType[];
  locations: CatalogueLocation[];
}> {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOME_NETWORK);

  const [devicesResult, types, locations] = await Promise.all([
    listNetworkDevicesForUi(householdId, { include_retired: includeRetired }),
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
  const mac = String(formData.get("mac") ?? "").trim() || undefined;
  const result = await addNetworkDevice(householdId, {
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    location: String(formData.get("location") ?? ""),
    notes: String(formData.get("notes") ?? "") || undefined,
    mac_address: mac,
    wake_allowed: formData.get("wake_allowed") === "on",
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
  const macRaw = formData.get("mac");
  const result = await updateNetworkDevice(householdId, {
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? "") || undefined,
    type: String(formData.get("type") ?? "") || undefined,
    location: String(formData.get("location") ?? "") || undefined,
    notes: notesRaw === null ? undefined : String(notesRaw),
    mac_address: macRaw === null ? undefined : String(macRaw),
    wake_allowed: formData.get("wake_allowed") === "on",
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

export async function getNetworkDeviceAction(
  id: string,
): Promise<NetworkDeviceDetail | null> {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOME_NETWORK);
  const result = await getNetworkDevice(householdId, id);
  if (isDomainError(result)) return null;
  return result;
}

// --- T-110 LAN scan ---

export async function startNetworkScanAction(): Promise<
  ActionResult<ScanJobSnapshot>
> {
  const { householdId } = await adminNetwork();
  const result = await startNetworkScan(householdId);
  if (isDomainError(result)) return fromDomainError(result);
  return okResult(result);
}

export async function getNetworkScanStatusAction(
  jobId: string,
): Promise<ActionResult<ScanJobSnapshot>> {
  const { householdId } = await adminNetwork();
  const snap = getScanJob(jobId, householdId);
  if (!snap) {
    return failResult("Scan job not found.", "scan_job_not_found");
  }
  return okResult(snap);
}

export async function cancelNetworkScanAction(
  jobId: string,
): Promise<ActionResult<ScanJobSnapshot>> {
  const { householdId } = await adminNetwork();
  const snap = cancelScanJob(jobId, householdId);
  if (!snap) {
    return failResult("Scan job not found.", "scan_job_not_found");
  }
  return okResult(snap);
}

export async function enrollFromScanCandidateAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminNetwork();
  const ip = String(formData.get("ip") ?? "").trim();
  const mac = String(formData.get("mac") ?? "").trim() || undefined;
  const hostname =
    String(formData.get("hostname") ?? "").trim() || undefined;
  const type = String(formData.get("type") ?? "");
  const location = String(formData.get("location") ?? "");
  const nameRaw = String(formData.get("name") ?? "").trim();
  const name = (nameRaw || hostname || ip).slice(0, 200);

  const result = await addNetworkDevice(householdId, {
    name,
    type,
    location,
    mac_address: mac,
    last_seen_ip: ip || undefined,
    last_seen_hostname: hostname,
  });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/network");
  return okResult();
}
