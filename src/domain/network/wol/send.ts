import { createSocket } from "node:dgram";
import { DomainError } from "@/domain/error";
import { buildMagicPacket, resolveWolTargets } from "./packet";

const WOL_PORTS = [9, 7] as const;

export type SendMagicPacketOptions = {
  /** Last-seen LAN IPs (server-side only). Tried before broadcast. */
  unicastIps?: Array<string | null | undefined>;
};

function sendOnce(
  packet: Buffer,
  host: string,
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
        socket.send(packet, port, host, (err) => {
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
 * Send a Wake-on-LAN magic packet.
 * Tries unicast last-seen IPs then directed broadcast; succeeds if any UDP send works.
 * Does not log or return the MAC.
 */
export async function sendMagicPacket(
  macNormalized: string,
  opts?: SendMagicPacketOptions,
): Promise<void | DomainError> {
  const packet = buildMagicPacket(macNormalized);
  const targets = resolveWolTargets(opts?.unicastIps);
  const errors: string[] = [];
  for (const host of targets) {
    for (const port of WOL_PORTS) {
      try {
        await sendOnce(packet, host, port);
        return;
      } catch (err) {
        errors.push(
          err instanceof Error
            ? err.message
            : `${host}:${port} send failed`,
        );
      }
    }
  }
  return DomainError.unavailable(
    `Wake-on-LAN send failed (${errors.join("; ") || "unknown"}).`,
    "wol_send_failed",
  );
}
