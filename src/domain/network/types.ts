export type NetworkTypeRef = {
  id: string;
  slug: string;
  name: string;
};

export type NetworkLocationRef = {
  id: string;
  slug: string;
  name: string;
};

export type NetworkDeviceDetail = {
  id: string;
  name: string;
  notes?: string;
  retired_at?: string;
  /** True when allowlisted + MAC present + not retired. Never exposes the MAC. */
  wake_capable: boolean;
  /** True when SSAP client key present + not retired. Never exposes the key. */
  tv_capable: boolean;
  type: NetworkTypeRef;
  location: NetworkLocationRef;
};

export type ListNetworkDevicesInput = {
  location?: string;
  type?: string;
  include_retired?: boolean;
};

export type AddNetworkDeviceInput = {
  name: string;
  type: string;
  location: string;
  notes?: string;
  /** UI / enroll-from-scan only — never exposed on MCP. */
  mac_address?: string;
  /** UI only — requires mac_address. */
  wake_allowed?: boolean;
  last_seen_ip?: string;
  last_seen_hostname?: string;
};

export type UpdateNetworkDeviceInput = {
  id: string;
  name?: string;
  type?: string;
  location?: string;
  notes?: string;
  mac_address?: string | null;
  /** UI only — requires MAC when enabling; clearing MAC clears allowlist. */
  wake_allowed?: boolean;
  last_seen_ip?: string | null;
  last_seen_hostname?: string | null;
};

/** ADMIN UI list row — identity fields never go through MCP mappers. */
export type NetworkDeviceUiRow = NetworkDeviceDetail & {
  mac_address?: string;
  wake_allowed: boolean;
  last_seen_ip?: string;
  last_seen_hostname?: string;
  /** Paired for SSAP — never includes the client key. */
  ssap_paired: boolean;
  ssap_host?: string;
  jellyfin_app_id?: string;
};

export type WakeNetworkDeviceResult = {
  id: string;
  name: string;
  status: "sent" | "dry_run";
};

export type TvLaunchTarget = "home" | "jellyfin";

export type TvInputId = "hdmi1" | "hdmi2" | "hdmi3" | "hdmi4" | "live_tv";

export type TvControlResult = {
  id: string;
  name: string;
  status: "ok" | "woke_and_ok" | "dry_run";
  action: "go_home" | "launch_app" | "set_input";
};

export type SsapAppListItem = {
  id: string;
  title: string;
};
