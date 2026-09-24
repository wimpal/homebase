import { createSocket } from "node:dgram";
import { DomainError } from "@/domain/error";
import { buildMagicPacket, resolveWolBroadcast } from "./packet";

const WOL_PORTS = [9, 7] as const;

function sendOnce(
  packet: Buffer,
  broadcast: string,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    socket.once("error", (err) => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      reject(err);
    });
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
        socket.send(packet, port, broadcast, (err) => {
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          if (err) reject(err);
          else resolve();
        });
      } catch (err) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        reject(err);
      }
    });
  });
}

/**
 * Send a Wake-on-LAN magic packet to the configured broadcast address.
 * Does not log or return the MAC.
 */
export async function sendMagicPacket(
  macNormalized: string,
): Promise<void | DomainError> {
  const packet = buildMagicPacket(macNormalized);
  const broadcast = resolveWolBroadcast();
  const errors: string[] = [];
  for (const port of WOL_PORTS) {
    try {
      await sendOnce(packet, broadcast, port);
      return;
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : `port ${port} send failed`,
      );
    }
  }
  return DomainError.unavailable(
    `Wake-on-LAN send failed (${errors.join("; ") || "unknown"}).`,
    "wol_send_failed",
  );
}
