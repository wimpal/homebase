# NAS deployment guide

HomeBase runs as four Docker containers: **app**, **worker**, **postgres**, and **redis**. Data persists in Docker volumes (database, uploads).

## Prerequisites

- NAS with **Docker** support (Synology Container Manager, QNAP Container Station, TrueNAS SCALE, or plain Linux + Docker)
- **Git** on the NAS (or clone from your PC and copy the folder)
- SSH access (recommended for easy redeploys)

**Home LAN (this household):** Zyxel T-56 (`192.168.1.0/24`, gateway `192.168.1.1`). TP-Link Archer BE230 is in **Access Point** mode (office Wi‑Fi / switch). NAS default LAN IP: **`192.168.1.142`** — reserve it on T-56 DHCP. Dirigera hub and TV are on the same flat network.

---

## One-time setup on the NAS

### 1. Clone the project

SSH into your NAS (or use its terminal):

```bash
# Example paths — adjust for your NAS
mkdir -p /volume1/docker
cd /volume1/docker
git clone <your-repo-url> homebase
cd homebase
```

Synology: you can also put the folder under `/volume1/docker/` and use **Container Manager → Project** with the `docker-compose.yml` file.

### 2. Create production `.env`

```bash
cp .env.example .env
nano .env   # or use your NAS text editor
```

**Must change:**

| Variable | Example | Why |
|----------|---------|-----|
| `AUTH_SECRET` | long random string | Session security |
| `AUTH_URL` | `http://192.168.1.50:3000` | Your NAS IP + port — **not** `localhost` |
| `POSTGRES_PASSWORD` | strong password | Database security |
| `DATABASE_URL` | match postgres password | Only needed for local dev |

Generate a secret:

```bash
openssl rand -base64 32
```

Optional — Web Push keys (on any machine with Node):

```bash
npx web-push generate-vapid-keys
```

Copy public key to both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

### 3. First deploy

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Or manually:

```bash
docker compose up -d --build
docker compose exec worker npx tsx scripts/migrate-shopping-slots.ts
docker compose exec worker npx prisma db push --accept-data-loss
docker compose exec app npm run db:seed   # optional demo data
```

### 4. Open the app

Visit `http://<NAS-IP>:3000` from a device on your **home LAN** (trusted network).

**Accounts (T-092 / ADR-020):** one Household per install.

- **Zero households:** use **Create household** (first Account becomes ADMIN).
- **One household:** use **Join account** (new Account joins as MEMBER). Open join is intentional for a trusted LAN — do **not** port-forward Homebase to the public internet.
- **Forgot password:** optional SMTP (below). If SMTP is unset, the UI tells people to ask an ADMIN; ADMINs reset member passwords in **Settings → Members**.

Demo credentials if you ran seed: `demo@homebase.local` / `demo1234`.

### Optional — SMTP for password reset emails

Set these in `.env` (passed through to the **app** container). There is no mail-settings UI.

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` | SMTP server hostname (required to enable email reset) |
| `SMTP_FROM` | From address, e.g. `HomeBase <homebase@example.com>` (required) |
| `SMTP_PORT` | Default `587` |
| `SMTP_USER` / `SMTP_PASS` | Auth if your relay needs it |
| `SMTP_SECURE` | `true` / `1` for TLS on connect (port 465); otherwise STARTTLS on 587 |

Reset emails contain a **link only** — never a plaintext password. Links are built from `AUTH_URL`.

After changing SMTP env vars: `docker compose up -d` (or redeploy) so the app container picks them up.

---

## Redeploy after code changes

### Option A — Deploy from your PC (recommended)

**New PC?** One-time SSH key + Docker group setup:
**[docs/nas-pc-setup.md](nas-pc-setup.md)** (checklist at the bottom).

From the repo root on Windows (NAS share reachable + SSH key auth working):

```powershell
npm run deploy:nas
```

Optional `.env` on your **Windows** machine (gitignored):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NAS_HOST` | `192.168.1.142` | NAS IP |
| `NAS_USER` | `wim` | SSH user |
| `NAS_PATH` | `/volume1/docker/homebase` | Path on the NAS |
| `NAS_SHARE` | `\\192.168.1.142\docker\homebase` | Windows SMB path to git checkout |
| `NAS_BRANCH` | `main` | Branch to pull / archive |

Variants:

```powershell
npm run deploy:nas -- -Push      # git push origin first
npm run deploy:nas -- -UseScp    # no share: tarball via scp
```

Git Bash: `./scripts/deploy-nas.sh` (same flow).

The script:

1. `git pull --ff-only` on the NAS SMB share (aborts if the share has uncommitted edits — review before discarding)
2. SSH → `docker compose up --build -d`
3. `npx tsx scripts/migrate-shopping-slots.ts` then `npx tsx scripts/migrate-project-work-items.ts` then `prisma db push --accept-data-loss` inside the **worker** container (shopping backfill + ProjectStep → work items before push)
4. Curl `/health` on port 3000
5. **Smoke purge (pre)** — household-scoped `purge-smoke-data.ts --apply` on the worker (clears historical `mcp-smoke*` / `Smoke Add *` junk). Skipped if `HOMEBASE_SMOKE_KEEP_DATA=1`.
6. **Post-deploy `mcp:smoke`** against `http://<NAS>:3000` (unless `-SkipSmoke` / `--skip-smoke`). Lights stay list-only on remote.
7. **Smoke purge (post)** — same purge again (and smoke self-cleans after success/failure). Residual rows fail the purge CLI and thus the deploy.

Credentials come from the **running app container** (`SERVICE_TOKEN` / `MCP_HOUSEHOLD_ID`), falling back to the NAS share `.env` only. Local Windows `.env` is not used for remote smoke (avoids purging the wrong household).

`./scripts/deploy.sh` on the NAS itself rebuilds only — no smoke/purge. Use PC `deploy:nas` / `deploy-nas.sh` for that.
Legacy alternative (SSH + on-NAS `deploy.sh` only):

```powershell
.\scripts\deploy-remote.ps1 -NasHost 192.168.1.50 -NasUser admin -NasPath /volume1/docker/homebase
```

### Option B — Deploy directly on the NAS

```bash
ssh admin@192.168.1.50
cd /volume1/docker/homebase
git pull
./scripts/deploy.sh
```

### What `deploy.sh` does

1. `docker compose up -d --build` — rebuild app + worker, restart all services
2. `migrate-shopping-slots.ts` — T-035 data cleanup (raw SQL, before push; safe to re-run)
3. `migrate-project-work-items.ts` — T-082 ProjectStep → ProjectWorkItem (before push; safe to re-run)
4. `prisma db push --accept-data-loss` — apply schema changes
5. `ensure-product-ci-index.ts` — case-insensitive unique product names per household

**Does not** run `mcp:smoke` or smoke purge. For those, redeploy from a PC with `npm run deploy:nas` / `./scripts/deploy-nas.sh`.

Your **database and uploads are preserved** in Docker volumes across redeploys.

### Purge MCP smoke leftovers

`mcp:smoke` creates shopping items, products, chores, and recipes named with
`mcp-smoke*` / `Smoke Add *`, plus Home Feed notifications titled
`Low stock: mcp-smoke-…` / `Chore due: mcp-smoke-…` while those rows exist.
Remote inventory smoke may briefly mutate a **real** stocked product and revert it
(mid-run failure can leave wrong qty — not prefix-purgable).

**Auto-cleanup (T-081 + T-094):**

- **Local** MCP target (`localhost` / `127.0.0.1`) — Prisma purge against `DATABASE_URL`.
- **Remote** MCP target (e.g. post-deploy against the NAS) — **always** SSH into the
  NAS worker and run the purge there. Local Prisma is never used for remote smoke
  (it would clean the wrong database). `deploy:nas` / `deploy-nas.sh` export `NAS_HOST` /
  `NAS_USER` / `NAS_PATH` / `NAS_SSH_PORT` for this path.
- Deploy also runs household-scoped purge **before and after** smoke (and when
  `-SkipSmoke`), so historical junk is cleared even if smoke is skipped.
- Cleanup runs after smoke success **and** failure; `--apply` **verifies** zero
  residuals and exits nonzero if any remain (or if `MCP_HOUSEHOLD_ID` is not a
  real household row — scoped purge must not silently no-op).
- McpChangeLog orphans after revert match `payloadJson` text containing
  `mcp-smoke` / `Smoke Add`.
- Skip purge with `HOMEBASE_SMOKE_KEEP_DATA=1`.
- Remote cleanup failure **fails the smoke** (and thus `deploy:nas`).

**Ops note:** never strip CR from household ids with busybox `tr -d "\r"` (double
quotes) — some NAS shells treat that as “delete letter r” and corrupt the id.

Manual purge inside the **worker** container:

```bash
docker compose exec worker npx tsx scripts/purge-smoke-data.ts          # dry-run
docker compose exec -e MCP_HOUSEHOLD_ID="$MCP_HOUSEHOLD_ID" worker \
  npx tsx scripts/purge-smoke-data.ts --apply
```

Pass `MCP_HOUSEHOLD_ID` (app env / compose). Does not touch demo seed users or real
household rows without those prefixes.
### Notification retention

The worker purges Home Feed rows daily at 03:15 (`read` older than 30 days; any
row older than 90 days). New schema fields (`Notification.dedupeKey`,
`NotificationTypeSetting`) need a `prisma db push` on deploy (already part of
`deploy.sh` / `deploy:nas`).

---

## Synology (Container Manager)

1. Install **Container Manager** from Package Center
2. Enable SSH (Control Panel → Terminal & SNMP)
3. Clone repo to e.g. `/volume1/docker/homebase`
4. Create `.env` as above
5. In Container Manager → **Project** → Create → path to folder → use existing `docker-compose.yml`
6. For updates: SSH in and run `./scripts/deploy.sh`, or recreate the project after git pull

## QNAP (Container Station)

Same flow as Synology: clone to a shared folder, add `.env`, run `docker compose up -d --build` via SSH.

## Reverse proxy + HTTPS (optional)

For `https://homebase.yourdomain.local` and PWA install on phones:

- Put **Nginx**, **Caddy**, or your NAS reverse proxy in front of port 3000
- Set `AUTH_URL` to the public HTTPS URL (e.g. `https://homebase.home.local`)
- Synology: Control Panel → Login Portal → Reverse Proxy

---

## Backup

Daily backups use **`scripts/backup-nas.sh`** → `/volume1/Docker-backups/homebase/` (off the live
compose tree). Postgres is dumped online (`pg_dump`); uploads are archived from the Docker
volume. No downtime required.

Full schedule, retention, restore drill, and disaster recovery:
**[docs/backup-restore.md](backup-restore.md)**

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy asks for SSH password | Set up SSH key auth — see **[nas-pc-setup.md](nas-pc-setup.md)** (include NAS IP in `~/.ssh/config` `Host` line) |
| `permission denied` on `docker.sock` during deploy | Add deploy user to `docker` group on NAS — see **[nas-pc-setup.md](nas-pc-setup.md)** §4 |
| Login redirects wrong | `AUTH_URL` must match the URL in your browser |
| Build fails on NAS | NAS CPU may be slow — first build can take 10–20 min |
| Out of memory during build | Build on your PC, push image to a registry, or increase NAS swap |
| Scheduler not running | Ensure `worker` container is up: `docker compose ps` |
| Dirigera not working | Set `DIRIGERA_IP` + `DIRIGERA_TOKEN` in `.env`; NAS must reach `https://<IP>:8443` — see [dirigera-setup.md](dirigera-setup.md) |

---

## Dirigera (IKEA smart home)

Pairing, NAS env, MCP smoke, SMART_HOME vs MCP, and which devices are controllable:
**[dirigera-setup.md](dirigera-setup.md)**.

The NAS app container must reach `https://<DIRIGERA_IP>:8443` on the home LAN. Do not
expose the hub to the public internet. Post-deploy MCP smoke is list-only for real
lamps (T-038) and never runs `party_mode`.

---

## Quick reference

```bash
docker compose ps              # status
docker compose logs -f app     # app logs
docker compose logs -f worker  # scheduler logs
docker compose down            # stop (data kept in volumes)
docker compose up -d --build   # rebuild and start
# purge mcp-smoke leftovers — dry-run then --apply (see "Purge MCP smoke leftovers")
docker compose exec worker npx tsx scripts/purge-smoke-data.ts
```
