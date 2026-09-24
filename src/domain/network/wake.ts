import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toNetworkDeviceDetail } from "./map";
import { assertHomeNetworkEnabled } from "./module-gate";
import type { WakeNetworkDeviceResult } from "./types";
import { isWolDryRun, tryReserveWake } from "./wol/packet";
import { sendMagicPacket } from "./wol/send";

/**
 * Send Wake-on-LAN for an allowlisted Network device.
 * Resolves MAC server-side; never returns MAC.
 */
export async function wakeNetworkDevice(
  householdId: string,
  deviceId: string,
): Promise<WakeNetworkDeviceResult | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;

  const id = (deviceId ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const row = await prisma.networkDevice.findFirst({
    where: { id, householdId },
    include: { type: true, location: true },
  });
  if (!row) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }
  if (row.retiredAt) {
    return DomainError.invalidInput(
      "Cannot wake a retired device.",
      "device_retired",
    );
  }
  if (!row.wakeAllowed) {
    return DomainError.invalidInput(
      "Device is not wake-allowlisted.",
      "wake_not_allowed",
    );
  }
  if (!row.macAddress) {
    return DomainError.invalidInput(
      "Device has no MAC for Wake-on-LAN.",
      "wake_no_mac",
    );
  }

  // Reserve after validation, before send — concurrent wakes of the same id collide here.
  const limited = tryReserveWake(householdId, id);
  if (limited) return limited;

  const detail = toNetworkDeviceDetail(row);

  if (isWolDryRun()) {
    return { id: detail.id, name: detail.name, status: "dry_run" };
  }

  const sent = await sendMagicPacket(row.macAddress);
  if (sent instanceof DomainError) return sent;

  return { id: detail.id, name: detail.name, status: "sent" };
}
