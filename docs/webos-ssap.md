# LG webOS SSAP control (T-112)

ADMIN pairs an LG webOS TV on `/network` (Home network). Mimir / MCP then calls
`homebase.devices.go_home`, `launch_app`, or `set_input` with **device id only** —
never a MAC or SSAP client key.

Depends on Wake-on-LAN ([docs/wake-on-lan.md](wake-on-lan.md)) for power-on.
Ready-wait after wake is owned by Homebase (`wake_if_needed`).

## Configure

```bash
# Skip live SSAP sockets (smoke / CI). Pair stores a dry-run key; control returns
# status "dry_run".
# HOMEBASE_SSAP_DRY_RUN=1
```

Host resolution: optional **SSAP host** on the Network device, else `lastSeenIp`
from LAN scan.

## Pair (operator)

1. Enroll the LG OLED on `/network` with MAC + wake allowlist (T-101).
2. Ensure the TV is on and reachable (last-seen IP or set SSAP host).
3. Edit device → **Pair TV** → accept the prompt on the TV remote.
4. **List apps** → pick Jellyfin (or paste app id) → **Save TV settings**.
5. Badge shows **TV** when paired. The client key is never displayed after save.

## MCP tools

| Tool | Purpose |
|------|---------|
| `devices.go_home` | Open webOS Home |
| `devices.launch_app` | `target: home \| jellyfin` |
| `devices.set_input` | `hdmi1`–`hdmi4` \| `live_tv` |

All accept optional `wake_if_needed`: WoL (if allowlisted) → 8s floor → poll SSAP
up to 90s → action. List/get expose `tv_capable` (paired + not retired) only.

Household console is **HDMI 1**.

## Self-test / smoke

```bash
npm run network:ssap-selftest   # pure unit — no TV
# mcp-smoke: unpaired → clear error; dry-run when HOMEBASE_SSAP_DRY_RUN=1
```

## Live verify

1. Pair the household OLED once.
2. Chat: wake + open Home (`wake_if_needed`) — lands on Home, not blank HDMI.
3. Launch Jellyfin when app id is set.
4. `set_input` `hdmi1` for the console.
5. Note the date in the T-112 task Notes.
