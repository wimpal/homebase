# Wake-on-LAN (T-101)

ADMIN allowlists a **Network device** (MAC + wake checkbox) on `/network`.
Mimir / MCP calls `homebase.devices.wake` with **device id only** — never a MAC.

## Configure

```bash
# Optional directed broadcast
HOME_NETWORK_WOL_BROADCAST=192.168.1.255

# Or derive directed broadcast from the scan CIDR (same as T-110)
HOME_NETWORK_SCAN_CIDR=192.168.1.0/24

# Skip UDP send (smoke / CI). Response status is "dry_run", not "sent".
# HOMEBASE_WOL_DRY_RUN=1
```

If neither broadcast nor CIDR is set, Homebase sends to `255.255.255.255`.

Both `HOME_NETWORK_SCAN_CIDR` and `HOME_NETWORK_WOL_BROADCAST` are passed into
the `app` container via `docker-compose.yml`.

The `app` container stays on the Compose **bridge** network (Postgres DNS). Do
**not** set `network_mode: host` on `app`.

## Delivery from Docker

Directed broadcast from a bridge container often **never reaches the household
LAN**, even when the UDP send “succeeds” inside the container. Homebase therefore:

1. Unicasts the magic packet to the device’s **`lastSeenIp`** (when known)
2. Then tries the configured directed broadcast

Unicast to a recent LAN IP is normally NATed out of the bridge and reaches a
NIC in standby. Keep last-seen fresh via a network scan while the device is on.

### Diagnose (operator)

1. From a LAN PC, send a magic packet to the Ethernet MAC (ports 9 and 7) —
   if the TV wakes, allowlist/settings are fine and the gap is Docker delivery.
2. Confirm `/network` shows a last-seen IP for the device (e.g. `192.168.1.93`).
3. Chat wake → confirm; TV should power on after deploy of the unicast path.
4. If unicast still fails after deploy, follow-up: host-network WoL helper
   (do **not** put `app` on host network).

## Security

- Allowlist is ADMIN UI only (MCP cannot set MAC or `wake_allowed`)
- MCP never accepts or returns a MAC (ADR-021)
- Rate limit: 60 seconds per device (best-effort, in-process)
- Mimir always M3-confirms before `devices.wake`

## Live verify (operator)

1. Enroll the target (e.g. LG OLED Ethernet MAC) on `/network` with wake checked
2. From a LAN PC, confirm one magic packet wakes the device
3. Then wake via Mimir / MCP with the device id after allowlist
4. Note the date in control-heim `status/homebase.md` Notes

Household target: LG OLED — enable **Turn on via Wi-Fi** even on cable; use the
**Ethernet** MAC; TV in standby on the same subnet as the NAS (`192.168.1.142`).

## Smoke

`mcp:smoke` seeds allowlisted / non-allowlisted / retired fixtures via Prisma
(locally administered MAC `02:…`), calls `devices.wake`, asserts no MAC leak,
rate-limit, and refusals. Prefer `HOMEBASE_WOL_DRY_RUN=1` on the **app** when
UDP is undesirable; otherwise smoke expects `status: "sent"`.

Self-test targets: `npm run network:wol-selftest`.
