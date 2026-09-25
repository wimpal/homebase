import WebSocket from "ws";
import { DomainError } from "@/domain/error";

const SSAP_PORT = 3000;
const DEFAULT_CONNECT_MS = 8_000;
const DEFAULT_REQUEST_MS = 15_000;
const PAIR_TIMEOUT_MS = 120_000;

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

export type SsapSession = {
  clientKey: string;
  request: (
    uri: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  close: () => void;
};

function wsUrl(host: string): string {
  return `ws://${host}:${SSAP_PORT}`;
}

function openSocket(host: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl(host), {
      handshakeTimeout: timeoutMs,
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
    // Pairing: ignore intermediate "response" prompts; wait for registered/error
    if (
      msg.type === "response" &&
      msg.payload &&
      (msg.payload.pairingType === "PROMPT" ||
        msg.payload.returnValue === true) &&
      !msg.payload["client-key"]
    ) {
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
    return (msg.payload ?? {}) as Record<string, unknown>;
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

export async function ssapListApps(
  session: SsapSession,
): Promise<Array<{ id: string; title: string }>> {
  const payload = await session.request(
    "ssap://com.webos.applicationManager/listApps",
    {},
  );
  const apps = (payload.apps ?? payload) as unknown;
  if (!Array.isArray(apps)) return [];
  const out: Array<{ id: string; title: string }> = [];
  for (const raw of apps) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? row.appId ?? "").trim();
    if (!id) continue;
    const title = String(row.title ?? row.name ?? id);
    out.push({ id, title });
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

export function isSsapDryRun(): boolean {
  return process.env.HOMEBASE_SSAP_DRY_RUN === "1";
}
