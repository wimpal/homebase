import type {
  DeviceLocation,
  NetworkDevice,
  NetworkDeviceType,
} from "@prisma/client";
import type { NetworkDeviceDetail } from "./types";

type Row = NetworkDevice & {
  type: NetworkDeviceType;
  location: DeviceLocation;
};

export function toNetworkDeviceDetail(row: Row): NetworkDeviceDetail {
  const wake_capable = Boolean(
    row.wakeAllowed && row.macAddress && !row.retiredAt,
  );
  const tv_capable = Boolean(row.ssapClientKey && !row.retiredAt);
  const detail: NetworkDeviceDetail = {
    id: row.id,
    name: row.name,
    wake_capable,
    tv_capable,
    type: {
      id: row.type.id,
      slug: row.type.slug,
      name: row.type.name,
    },
    location: {
      id: row.location.id,
      slug: row.location.slug,
      name: row.location.name,
    },
  };
  if (row.notes) detail.notes = row.notes;
  if (row.retiredAt) detail.retired_at = row.retiredAt.toISOString();
  return detail;
}
