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
