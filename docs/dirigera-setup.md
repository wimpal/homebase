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

### Colour, brightness, and warmth (T-040)

| Public field | Hub attribute | Notes |
|---|---|---|
| `brightness` (0–100) | `lightLevel` | Applied only when `on: true` |
| `color_temp_kelvin` | `colorTemperature` | Kelvin; clamped to device `colorTemperatureMin`/`Max` (often inverted on the hub) |
| `color_hex` (`#RRGGBB`) | `colorHue` + `colorSaturation` | Homebase converts hex ↔ HS |
| `supports_brightness` / `supports_color_temp` / `supports_color` | `capabilities.canReceive` | `lightLevel`, `colorTemperature`, `colorHue` (+ `colorSaturation`) |

Do **not** send `color_hex` and `color_temp_kelvin` in the same `set_state` call — Homebase rejects with `Specify colour or color temperature, not both`. Capability refusals: `Device does not support colour` / `Device does not support color temperature`.

**Hub quirk:** Dirigera applies only the first attribute in a single PATCH attributes bag (`isOn`+`lightLevel` → only on/off). Homebase therefore issues **separate** patches for on/off, brightness, warmth, and colour (hue+saturation stay one pair).

### Colour presets (Tradfri / IKEA Home smart)

RGB lamps snap to the official chromatic hex presets (same set as the IKEA app property 5706). Smart Home UI shows these as colour buttons; MCP prefers `color_preset` over free hex:

| id | Hex | Name |
|---|---|---|
| `blue` | `#4A418A` | Blue |
| `light_blue` | `#6C83BA` | Light blue |
| `saturated_purple` | `#8F2686` | Saturated purple |
| `lime` | `#A9D62B` | Lime |
| `light_purple` | `#C984BB` | Light purple |
| `yellow` | `#D6E44B` | Yellow |
| `saturated_pink` | `#D9337C` | Saturated pink |
| `dark_peach` | `#DA5D41` | Dark peach |
| `saturated_red` | `#DC4B31` | Saturated red |
| `pink` | `#E491AF` | Pink |
| `peach` | `#E57345` | Peach |
| `warm_amber` | `#E78834` | Warm amber |
| `light_pink` | `#E8BEDD` | Light pink |

Whites (warm/cool) use the **warmth** control / `color_temp_kelvin`, not colour buttons.

Not every IKEA lamp supports RGB. Prefer **Ballon** (Kantoor) for warmth/brightness smoke; **paarse lamp** / **bank lamp** / **eettafel lamp** (Woonkamer) for colour (`supports_color: true`). Confirm with `lights.list`.

## Test lamp (this household)

| | |
|--|--|
| Lamp | **Ballon** |
| Room | **Kantoor** (sole lamp in that room) |
| Room-all | **Woonkamer** (~3 IKEA lamps) |
| Count | ~6 IKEA lights; some may be unreachable |

Verify live names, rooms, and `supports_*` with `homebase.lights.list` before chat smoke. Hub `room` strings are the match target.

## MCP smoke (list-only — do not toggle household lamps)

Post-deploy smoke must not call `lights.set_state` on a real lamp (T-038) and must never run `party_mode`. It may probe a fake `device_id` to confirm a stale-id error (no PATCH). List may include the new brightness/colour fields — still list-only.

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

Smart Home → **IKEA Lights** tab lists live devices from the hub. Per reachable lamp: on/off switch, plus brightness / warmth / colour controls when `supports_*` is true.

## Related

- NAS deploy: [nas-deploy.md](nas-deploy.md)
- Env template: `.env.example` (`DIRIGERA_IP` / `DIRIGERA_TOKEN`)
