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
export { getNetworkDevice } from "./get";
export { addNetworkDevice } from "./add";
export { updateNetworkDevice } from "./update";
export { retireNetworkDevice, restoreNetworkDevice } from "./retire";
export type {
  NetworkDeviceDetail,
  ListNetworkDevicesInput,
  AddNetworkDeviceInput,
  UpdateNetworkDeviceInput,
} from "./types";
