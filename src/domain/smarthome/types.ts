export interface DirigeraLight {
  id: string;
  name: string;
  room?: string;
  isOn: boolean;
  lightLevel?: number;
  isReachable: boolean;
}

export interface DirigeraMutationResult {
  success: boolean;
  error?: string;
}

export interface DirigeraPartyModeResult {
  success: boolean;
  duration_seconds?: number;
  devices_affected?: number;
  cycles?: number;
  restored?: boolean;
  error?: string;
}
