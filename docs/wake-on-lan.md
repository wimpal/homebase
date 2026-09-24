# Wake-on-LAN (T-101)

ADMIN allowlists a **Network device** (MAC + wake checkbox) on `/network`.
Mimir / MCP calls `homebase.devices.wake` with **device id only** — never a MAC.

## Configure

```bash
# Optional directed broadcast (preferred on Docker bridge)
HOME_NETWORK_WOL_BROADCAST=192.168.1.255

# Or derive directed broadcast from the scan CIDR (same as T-110)
HOME_NETWORK_SCAN_CIDR=192.168.1.0/24

# Skip UDP send (smoke / CI). Response status is "dry_run", not "sent".
# HOMEBASE_WOL_DRY_RUN=1
```

If neither broadcast nor CIDR is set, Homebase sends to `255.255.255.255`.

The `app` container stays on the Compose **bridge** network (Postgres DNS). Do
**not** set `network_mode: host` on `app`.

## Security

- Allowlist is ADMIN UI only (MCP cannot set MAC or `wake_allowed`)
- MCP never accepts or returns a MAC (ADR-021)
- Rate limit: 60 seconds per device (best-effort, in-process)
- Mimir always M3-confirms before `devices.wake`

## Live verify (operator)

1. Enroll the target (e.g. LG OLED Ethernet MAC) on `/network` with wake checked
2. From the NAS host (or a LAN PC), confirm one magic packet wakes the device
3. Then: `docker compose exec app …` is not required for chat — call via Mimir
   or MCP with the device id after allowlist
4. Note the date in control-heim `status/homebase.md` Notes

Household target candidate: LG OLED48C25LB — enable **Turn on via Wi-Fi** even on
cable; use the **Ethernet** MAC; TV in standby on the same subnet as the NAS
(`192.168.1.142`).

## Smoke

`mcp:smoke` seeds allowlisted / non-allowlisted / retired fixtures via Prisma
(locally administered MAC `02:…`), calls `devices.wake`, asserts no MAC leak,
rate-limit, and refusals. Prefer `HOMEBASE_WOL_DRY_RUN=1` on the **app** when
UDP is undesirable; otherwise smoke expects `status: "sent"`.
