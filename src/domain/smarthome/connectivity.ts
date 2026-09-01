import { DomainError } from "@/domain/error";
import { getDirigeraClient, isDirigeraConfigured } from "./client";

export async function verifyDirigeraConnectivity(): Promise<{ ok: true } | DomainError> {
  if (!isDirigeraConfigured()) {
    return DomainError.unavailable("Dirigera not configured");
  }

  const ip = process.env.DIRIGERA_IP;
  const client = await getDirigeraClient();
  if (!client) {
    return DomainError.unavailable("Dirigera not configured");
  }

  try {
    await client.home();
    return { ok: true };
  } catch {
    return DomainError.unavailable(
      `Cannot reach Dirigera hub at https://${ip}:8443`,
    );
  }
}
