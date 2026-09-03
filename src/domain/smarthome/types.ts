export interface DirigeraLight {
  id: string;
  name: string;
  room?: string;
  isOn: boolean;
  lightLevel?: number;
  colorTempKelvin?: number;
  colorHex?: string;
  colorTempMin?: number;
  colorTempMax?: number;
  supportsBrightness: boolean;
  supportsColorTemp: boolean;
  supportsColor: boolean;
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

export interface SetDirigeraLightStateOptions {
  brightness?: number;
  colorTempKelvin?: number;
  colorHex?: string;
}
