# Dirigera setup (IKEA lights)

Homebase talks to the **IKEA Dirigera** hub over HTTPS on port **8443** using a bearer token from one-time pairing. **Mimir never talks to the hub** — only the Homebase app container does.

MCP tools: `homebase.lights.list`, `homebase.lights.set_state`, `homebase.lights.party_mode`. Hue is kept in the Smart Home UI but is **out of MCP scope**.

## One-time pairing (on home LAN)

```bash
npx dirigera authenticate
# Press the action button on the bottom of the hub within 60 seconds
# Save the printed access token securely — not in git
npx dirigera dump --access-token <TOKEN>
# Lists devices — pick a light id for testing
```

## NAS env

Add to the NAS `.env` (never commit secrets):

| Variable | Example | Why |
|----------|---------|-----|
| `DIRIGERA_IP` | `192.168.0.42` | Hub LAN IP (router DHCP or IKEA app) |
| `DIRIGERA_TOKEN` | *(from pairing)* | Bearer token (~10 year lifetime) |

The app container must reach `https://<DIRIGERA_IP>:8443` on the home LAN. Redeploy after adding vars: `npm run deploy:nas` or `docker compose up -d --build`.

The hub uses a **self-signed TLS certificate**. The Node client sets `rejectUnauthorized: false` — required in Docker/NAS; do not expose the hub to the public internet.

### Verify connectivity (fail fast)

**From NAS host:**

```bash
curl -k https://<DIRIGERA_IP>:8443/v1/home -H "Authorization: Bearer <TOKEN>"
```

**From app container** (hard gate — must pass before Dirigera features work):

```bash
docker compose exec app wget -qO- --no-check-certificate \
  --header="Authorization: Bearer <TOKEN>" \
  https://<DIRIGERA_IP>:8443/v1/home
```

If the host works but the container fails, check Docker networking — NAS and hub must be on the same LAN (this household: T-56 `192.168.1.0/24`; Archer is AP mode). NAS: `192.168.1.142:3000`.

**Local hub smoke** (after deploy):

```bash
npm run dirigera:smoke
# Optional: DIRIGERA_TEST_DEVICE_ID=<light-id> toggles one light (local dev only)
```

## SMART_HOME module

Household **Settings → modules → Smart Home** gates the **Smart Home UI** only. MCP lights tools do **not** check this toggle — Mimir can list/toggle IKEA lights even if the module is off in the web app.

## What is controllable

- **IKEA / Dirigera lights only** via MCP.
- Philips Hue stays in the UI if configured; not on the MCP surface.
- Live query from the hub — no Prisma `Device` rows required.
- Some lamps may report `reachable: false` (Zigbee mesh). `set_state` does not write in that case; it returns `Device unreachable (Zigbee mesh)`.

## Test lamp (this household)

| | |
|--|--|
| Lamp | **Ballon** |
| Room | **Kantoor** (sole lamp in that room) |
| Room-all | **Woonkamer** (~3 IKEA lamps) |
| Count | ~6 IKEA lights; some may be unreachable |

Verify live names and rooms with `homebase.lights.list` before chat smoke. Hub `room` strings are the match target.

## MCP smoke (list-only — do not toggle household lamps)

Post-deploy smoke must not call `lights.set_state` on a real lamp (T-038) and must never run `party_mode`. It may probe a fake `device_id` to confirm a stale-id error (no PATCH).

**PowerShell (this household NAS):**

```powershell
$env:MCP_BASE_URL="http://192.168.1.142:3000"; npm run mcp:smoke
```

**bash:**

```bash
MCP_BASE_URL=http://192.168.1.142:3000 npm run mcp:smoke
```

For a local write round-trip on a pinned lamp that is **not** in daily use: `npm run mcp:smoke:full` with `DIRIGERA_TEST_DEVICE_ID` set. Never set that on the NAS deploy path.

## UI

Smart Home → **IKEA Lights** tab lists live devices from the hub.

## Related

- NAS deploy: [nas-deploy.md](nas-deploy.md)
- Env template: `.env.example` (`DIRIGERA_IP` / `DIRIGERA_TOKEN`)
