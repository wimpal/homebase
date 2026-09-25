export { ensureNetworkCatalogues } from "./ensure-catalogues";
export {
  SYSTEM_NETWORK_DEVICE_TYPES,
  RESERVED_DEVICE_LOCATIONS,
  slugifyLabel,
} from "./catalogue";
export {
  listNetworkDeviceTypes,
  listDeviceLocations,
  addNetworkDeviceType,
  addDeviceLocation,
  renameDeviceLocation,
} from "./catalogue-admin";
export type { CatalogueType, CatalogueLocation } from "./catalogue-admin";
export { listNetworkDevices } from "./list";
export { listNetworkDevicesForUi } from "./list-ui";
export { getNetworkDevice } from "./get";
export { addNetworkDevice } from "./add";
export { updateNetworkDevice } from "./update";
export { retireNetworkDevice, restoreNetworkDevice } from "./retire";
export { wakeNetworkDevice } from "./wake";
export {
  startNetworkScan,
  getScanJob,
  cancelScanJob,
  parseScanCidr,
} from "./scan";
export type {
  ScanJobSnapshot,
  ScanCandidateDto,
  ScanJobState,
  CandidateMatchStatus,
} from "./scan";
export type {
  NetworkDeviceDetail,
  NetworkDeviceUiRow,
  ListNetworkDevicesInput,
  AddNetworkDeviceInput,
  UpdateNetworkDeviceInput,
  WakeNetworkDeviceResult,
} from "./types";
export { matchCandidate } from "./match";
export { normalizeMacAddress } from "./identity";
export {
  clearWakeRateLimits,
  WOL_COOLDOWN_MS,
  buildMagicPacket,
  parseIpv4,
  resolveWolBroadcast,
  resolveWolTargets,
} from "./wol/packet";
