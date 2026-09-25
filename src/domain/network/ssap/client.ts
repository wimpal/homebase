import WebSocket from "ws";
import { DomainError } from "@/domain/error";

/** Modern webOS: secure SSAP. TV cert is self-signed — verify off. */
const SSAP_WSS_PORT = 3001;
/** Older webOS / fallback when 3001 fails. */
const SSAP_WS_PORT = 3000;
const DEFAULT_CONNECT_MS = 8_000;
const DEFAULT_REQUEST_MS = 15_000;
const PAIR_TIMEOUT_MS = 120_000;

export type SsapTransport = "wss" | "ws";

/** Last successful transport per host (in-process; single NAS replica). */
const preferredTransportByHost = new Map<string, SsapTransport>();

/** Endpoint order: prefer last winner, else wss:3001 then ws:3000. */
export function ssapEndpointCandidates(
  host: string,
): Array<{ transport: SsapTransport; url: string }> {
  const secure = {
    transport: "wss" as const,
    url: `wss://${host}:${SSAP_WSS_PORT}`,
  };
  const insecure = {
    transport: "ws" as const,
    url: `ws://${host}:${SSAP_WS_PORT}`,
  };
  if (preferredTransportByHost.get(host) === "ws") {
    return [insecure, secure];
  }
  return [secure, insecure];
}

/** Clear preferred-transport cache (selftest). */
export function clearSsapTransportPreferences(): void {
  preferredTransportByHost.clear();
}

const MANIFEST = {
  manifestVersion: 1,
  appVersion: "1.0.0",
  signed: {
    created: "20140509",
    appId: "com.homebase.ssap",
    vendorId: "com.homebase",
    localizedAppNames: {
      "": "Homebase",
      "en-US": "Homebase",
    },
    localizedVendorNames: {
      "": "Homebase",
    },
    permissions: [
      "LAUNCH",
      "LAUNCH_WEBAPP",
      "APP_TO_APP",
      "CONTROL_AUDIO",
      "CONTROL_DISPLAY",
      "CONTROL_INPUT_MEDIA_PLAYBACK",
      "CONTROL_POWER",
      "CONTROL_TV_SCREEN",
      "READ_APP_STATUS",
      "READ_CURRENT_CHANNEL",
      "READ_INPUT_DEVICE_LIST",
      "READ_NETWORK_STATE",
      "READ_RUNNING_APPS",
      "READ_TV_CHANNEL_LIST",
      "WRITE_NOTIFICATION_TOAST",
      "READ_POWER_STATE",
      "READ_COUNTRY_INFO",
      "READ_SETTINGS",
      "CONTROL_TV_POWER",
      "CONTROL_TV_CHANNEL",
      "READ_INSTALLED_APPS",
    ],
    serial: "Homebase",
  },
  permissions: [
    "LAUNCH",
    "LAUNCH_WEBAPP",
    "APP_TO_APP",
    "CONTROL_AUDIO",
    "CONTROL_DISPLAY",
    "CONTROL_INPUT_MEDIA_PLAYBACK",
    "CONTROL_POWER",
    "CONTROL_TV_SCREEN",
    "READ_APP_STATUS",
    "READ_CURRENT_CHANNEL",
    "READ_INPUT_DEVICE_LIST",
    "READ_NETWORK_STATE",
    "READ_RUNNING_APPS",
    "READ_TV_CHANNEL_LIST",
    "WRITE_NOTIFICATION_TOAST",
    "READ_POWER_STATE",
    "READ_COUNTRY_INFO",
    "READ_SETTINGS",
    "CONTROL_TV_POWER",
    "CONTROL_TV_CHANNEL",
    "READ_INSTALLED_APPS",
  ],
  signatures: [
    {
      signatureVersion: 1,
      signature:
        "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9",
    },
  ],
};

type SsapeMessage = {
  type?: string;
  id?: string;
  payload?: Record<string, unknown>;
  error?: string;
};

/**
 * Intermediate register ack while the TV shows the pair prompt.
 * Successful commands use returnValue:true without pairingType — do not treat
 * those as pairing prompts.
 */
export function isSsapPairingPromptAck(msg: {
  type?: string;
  payload?: Record<string, unknown> | null;
}): boolean {
  const payload = msg.payload;
  return (
    msg.type === "response" &&
    !!payload &&
    payload.pairingType === "PROMPT" &&
    !payload["client-key"]
  );
}

export type SsapSession = {
  clientKey: string;
  request: (
    uri: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  close: () => void;
};

function openOneEndpoint(
  url: string,
  transport: SsapTransport,
  timeoutMs: number,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url, {
      handshakeTimeout: timeoutMs,
      // LG uses a self-signed cert on :3001.
      rejectUnauthorized: transport === "wss" ? false : undefined,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      reject(new Error("SSAP connect timeout"));
    }, timeoutMs);

    ws.once("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Open SSAP WebSocket: try wss://host:3001 first, then ws://host:3000.
 * Remembers the winner per host for faster reconnect / ready-poll.
 */
async function openSocket(host: string, timeoutMs: number): Promise<WebSocket> {
  const candidates = ssapEndpointCandidates(host);
  let lastErr: unknown;
  for (const { transport, url } of candidates) {
    try {
      const ws = await openOneEndpoint(url, transport, timeoutMs);
      preferredTransportByHost.set(host, transport);
      return ws;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("SSAP connect failed");
}

/** Probe TCP/WS handshake for ready-polling after WoL. */
export async function probeSsapPort(
  host: string,
  timeoutMs = 3_000,
): Promise<boolean> {
  try {
    const ws = await openSocket(host, timeoutMs);
    ws.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Open SSAP and register. Null clientKey → on-TV prompt (pair).
 */
export async function openSsapSession(
  host: string,
  clientKey: string | null,
  opts?: { connectMs?: number; pairTimeoutMs?: number; requestMs?: number },
): Promise<SsapSession | DomainError> {
  const connectMs = opts?.connectMs ?? DEFAULT_CONNECT_MS;
  const pairTimeoutMs = opts?.pairTimeoutMs ?? PAIR_TIMEOUT_MS;
  const requestMs = opts?.requestMs ?? DEFAULT_REQUEST_MS;

  let ws: WebSocket;
  try {
    ws = await openSocket(host, connectMs);
  } catch {
    return DomainError.unavailable(
      "TV is unreachable over SSAP.",
      "ssap_unreachable",
    );
  }

  let nextId = 1;
  const pending = new Map<
    string,
    {
      resolve: (v: SsapeMessage) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const cleanup = () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error("SSAP closed"));
    }
    pending.clear();
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };

  ws.on("message", (data) => {
    let msg: SsapeMessage;
    try {
      msg = JSON.parse(String(data)) as SsapeMessage;
    } catch {
      return;
    }
    const id = msg.id;
    if (!id) return;
    const p = pending.get(id);
    if (!p) return;
    // Pairing only: TV acks with pairingType PROMPT before the user accepts.
    // Do NOT ignore returnValue:true — that is a normal successful command reply
    // (launch / switchInput). Swallowing it caused ~15s timeouts while the TV
    // had already acted (go_home false failure).
    if (isSsapPairingPromptAck(msg)) {
      return;
    }
    pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(msg);
  });

  ws.on("close", () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error("SSAP closed"));
    }
    pending.clear();
  });

  const sendRaw = (body: Record<string, unknown>, waitMs: number) =>
    new Promise<SsapeMessage>((resolve, reject) => {
      const id = String(body.id ?? `req_${nextId++}`);
      body.id = id;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("SSAP request timeout"));
      }, waitMs);
      pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify(body));
      } catch (err) {
        pending.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

  const registerPayload: Record<string, unknown> = {
    forcePairing: false,
    pairingType: "PROMPT",
    manifest: MANIFEST,
  };
  if (clientKey) {
    registerPayload["client-key"] = clientKey;
  }

  let registeredKey = clientKey ?? "";
  try {
    const reg = await sendRaw(
      {
        type: "register",
        id: `register_${nextId++}`,
        payload: registerPayload,
      },
      clientKey ? requestMs : pairTimeoutMs,
    );

    if (reg.type === "error") {
      cleanup();
      return DomainError.unavailable(
        "TV refused SSAP registration.",
        "ssap_register_failed",
      );
    }

    const keyFromPayload = reg.payload?.["client-key"];
    if (typeof keyFromPayload === "string" && keyFromPayload.trim()) {
      registeredKey = keyFromPayload.trim();
    } else if (reg.type === "registered" && clientKey) {
      registeredKey = clientKey;
    } else if (!registeredKey) {
      cleanup();
      return DomainError.unavailable(
        "TV did not return an SSAP client key. Accept the prompt on the TV.",
        "ssap_no_client_key",
      );
    }
  } catch (err) {
    cleanup();
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timeout")) {
      return DomainError.unavailable(
        clientKey
          ? "TV is unreachable over SSAP."
          : "TV pairing timed out. Accept the prompt on the TV and try again.",
        clientKey ? "ssap_unreachable" : "ssap_pair_timeout",
      );
    }
    return DomainError.unavailable(
      "TV is unreachable over SSAP.",
      "ssap_unreachable",
    );
  }

  const request = async (
    uri: string,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> => {
    const msg = await sendRaw(
      {
        type: "request",
        uri,
        payload,
      },
      requestMs,
    );
    if (msg.type === "error") {
      throw new Error(String(msg.error ?? "SSAP request error"));
    }
    const body = (msg.payload ?? {}) as Record<string, unknown>;
    // Match aiowebostv: explicit false means command rejected.
    if (body.returnValue === false) {
      throw new Error(
        String(body.errorText ?? body.errorCode ?? "SSAP returnValue false"),
      );
    }
    return body;
  };

  return {
    clientKey: registeredKey,
    request,
    close: cleanup,
  };
}

export async function ssapLaunchApp(
  session: SsapSession,
  appId: string,
): Promise<void> {
  await session.request("ssap://system.launcher/launch", { id: appId });
}

export async function ssapSwitchInput(
  session: SsapSession,
  inputId: string,
  fallbackAppId: string | null,
): Promise<void> {
  try {
    await session.request("ssap://tv/switchInput", { inputId });
  } catch {
    if (!fallbackAppId) throw new Error("switchInput failed");
    await ssapLaunchApp(session, fallbackAppId);
  }
}

/**
 * Normalize listLaunchPoints / listApps payloads into {id, title} rows.
 * Prefer launchPoints[], then apps[], then a bare array.
 */
export function normalizeSsapAppCatalog(
  payload: Record<string, unknown> | unknown,
): Array<{ id: string; title: string }> {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (Array.isArray(body.launchPoints)) {
    candidates.push(...body.launchPoints);
  }
  if (Array.isArray(body.apps)) {
    candidates.push(...body.apps);
  }
  if (Array.isArray(payload)) {
    candidates.push(...payload);
  }
  const byId = new Map<string, { id: string; title: string }>();
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? row.appId ?? "").trim();
    if (!id) continue;
    const title = String(row.title ?? row.name ?? id).trim() || id;
    if (!byId.has(id)) {
      byId.set(id, { id, title });
    }
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Catalog installed / launchable apps. Prefer listLaunchPoints (retail webOS);
 * fall back to listApps. Throws only if both requests fail.
 */
export async function ssapListApps(
  session: SsapSession,
): Promise<Array<{ id: string; title: string }>> {
  let lastErr: unknown;
  try {
    const payload = await session.request(
      "ssap://com.webos.applicationManager/listLaunchPoints",
      {},
    );
    const apps = normalizeSsapAppCatalog(payload);
    if (apps.length > 0) return apps;
  } catch (err) {
    lastErr = err;
  }
  try {
    const payload = await session.request(
      "ssap://com.webos.applicationManager/listApps",
      {},
    );
    const apps = normalizeSsapAppCatalog(payload);
    if (apps.length > 0) return apps;
  } catch (err) {
    lastErr = err;
  }
  if (lastErr) throw lastErr;
  return [];
}

export function isSsapDryRun(): boolean {
  return process.env.HOMEBASE_SSAP_DRY_RUN === "1";
}
