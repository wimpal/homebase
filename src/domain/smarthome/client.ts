import { createDirigeraClient, type DirigeraClient } from "dirigera";

export function isDirigeraConfigured(): boolean {
  return Boolean(process.env.DIRIGERA_IP && process.env.DIRIGERA_TOKEN);
}

export async function getDirigeraClient(): Promise<DirigeraClient | null> {
  const ip = process.env.DIRIGERA_IP;
  const token = process.env.DIRIGERA_TOKEN;
  if (!ip || !token) return null;

  return createDirigeraClient({
    gatewayIP: ip,
    accessToken: token,
    rejectUnauthorized: false,
  });
}
