# Dirigera sensors (T-067 discovery)

Design note for **M4c Phase B**. Evidence-only — no product UI, no MCP/contract
changes. Gates **T-068** (sensor → light Automations).

Related: [dirigera-setup.md](./dirigera-setup.md) (lights + Phase A schedules),
ADR-012 (Homebase owns Dirigera light automations).

**Do not confuse** with Prisma `SensorReading` / Smart Home “Sensors” tab — those
are **manual** temperature/humidity/air-quality logs, not Dirigera hub devices.

## How to re-run discovery

From a LAN host with `DIRIGERA_IP` + `DIRIGERA_TOKEN` (local `.env` preferred):

```bash
npm run dirigera:sensors                 # inventory (redacted)
npm run dirigera:sensors -- --listen     # inventory + 300s WebSocket listen
npm run dirigera:sensors -- --listen --listen-secs 90
npm run dirigera:sensors -- --full-local # fuller attrs to stdout only — do not commit
```

NAS fallback (after deploy that includes the script):  
`docker compose exec worker npx tsx scripts/dirigera-sensor-discovery.ts`  
(not the `app` container).

Default output allowlists trigger-relevant attrs and redacts serial/QR/setup fields.

## Inventory (this household) — 2026-09-15

Hub: LAN Dirigera (`dirigera` npm **1.8.2**). Single `devices.list()` snapshot.

| deviceType | Count | Notes |
|---|---:|---|
| light | 8 | Existing MCP / Automations Phase A |
| genericSwitch | 5 | Controllers/remotes — **out of scope** for M4c productization |
| environmentSensor | 1 | ALPSTUGA air quality monitor (“lucht monitor kantoor”, room Kantoor) |
| openCloseSensor | 1 | MYGGBETT door/window (“Toilet deur”, room Toilet) |
| gateway | 1 | Hub |

**Edge sensors for FUTURE_FEATURES story #2:** `openCloseSensor` present.
No `motionSensor` on this hub (optional later).

Environment sensor allowlisted snapshot (values drift): reachable; `isOn`;
temperature / RH / PM2.5 / CO2.

Open/close snapshot: reachable; `isOpen`; `batteryPercentage` 100.

### Earlier pass (2026-09-13)

Before the door sensor was re-paired: env sensor only; no edge sensors.
WS still worked for ALPSTUGA (`deviceStateChanged` ~30s).

### Exercise matrix (listen window)

| Device | Action | Result |
|---|---|---|
| Motion | Walk past | N/A — no `motionSensor` on hub |
| Open/close (“Toilet deur”) | Open/close door | **2026-09-15, 30s listen:** 6× `isOpen` true/false edges via WS |
| Environment (ALPSTUGA) | Idle | WS attribute updates continue (~30s); also saw 1 event in the same window |

WebSocket path works for open/close and environment sensors. Hub event timestamps vs
local receipt differed by ~7–8s on these runs — T-068 should prefer **local receipt
time** for debounce/cooldown clocks, and treat hub `time` as diagnostic only.

## Observation model (choice for T-068)

**Edge sensors (motion / open-close):**

1. **Primary:** WebSocket `deviceStateChanged` via `client.startListeningForUpdates`.
2. **Seed** current state on connect/reconnect with one `devices.list()` (or get).
3. **Do not** use polling to recover missed edges (same “no catch-up” spirit as
   Phase A schedule minutes).
4. Fire on **rising** (`false→true`: opens / detects) or **falling** (`true→false`:
   closes / clears), per rule `sensorEdgePolarity`.
5. Action may be turn on, turn off, or **toggle leave-session**. Turn on/off only
   write eligible lights (off→on or on→off).

### Toilet enter/leave pattern (Toggle leave-session)

One SENSOR_EDGE rule with action **Toggle** (session owns both open and close):

| Door | Session | Light |
|---|---|---|
| Open (enter) | idle → occupied | **on** |
| Close (sit) | stay occupied | stays on |
| Open (leave) | occupied → leaving | stays on |
| Close (leave) | leaving → idle | **off** |

Persisted on the rule as `toggleSession` (`null`/idle | `occupied` | `leaving`).
Cooldown only on hub writes (enter on / leave off); ignored sit-close does not burn
cooldown. Disable resets session to idle.

**Quick visit caveat:** open → use → close once (never close mid-stay, never second
open) never reaches `leaving`, so light stays on until a later Open+Close or manual
off. Classic sit-with-door-closed works.

**Level / slow sensors (environment, illuminance, etc.):**

- Optional periodic poll or WS attribute updates if a future rule needs thresholds.
- **Out of T-068 story #2** unless the product story changes.

**Hub-down:**

- Treat failed health probe (`client.home()` or list) and/or sustained WS failure as down.
- Log; **suppress fires**; single listener per worker process.
- On recovery: reconnect, **re-seed**, resume — **no mass light toggles**, no replay of
  edges that happened while down.

**Ownership:**

- Process-global `DIRIGERA_*` (same as lights today) ⇒ **one hub per Homebase
  deployment**. Sensor events inherit that; no multi-hub dispatch in v1.

## Debounce / cooldown sketch (defaults for T-068)

| Knob | Default | Scope |
|---|---|---|
| Rising-edge only | required | per sensor device id |
| Debounce | **2s** | collapse duplicate rising edges per sensor device id |
| Cooldown | **10s** | per automation **rule** after an apply attempt (was 90s sketch; too long for door cycles) |
| Failed Dirigera apply | still consume cooldown | avoid thrash (Phase A slot-claim spirit) |
| Missed while down | **no retroactive fire** | — |

Numbers are starting sketches; make them configurable in T-068 if built.

## Gate recommendation

**T-068 done (2026-09-15).** Operator confirmed on NAS: Toilet deur open → light on.
Create/edit rules in Smart Home → Automations (trigger: Sensor).
Smoke: `npm run automations:sensor-smoke`.

## Non-goals

- Env-threshold rules (separate task if needed).
- Home Assistant as lighting SoT.
- Blinds / outlets / remotes productization.
- Mapping Dirigera sensors onto Prisma `SensorReading`.
- MCP tools for sensors / “run named rule”.
- UI-tunable debounce/cooldown (fixed 2s / 10s).
