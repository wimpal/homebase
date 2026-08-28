# NAS deployment guide

HomeBase runs as four Docker containers: **app**, **worker**, **postgres**, and **redis**. Data persists in Docker volumes (database, uploads).

## Prerequisites

- NAS with **Docker** support (Synology Container Manager, QNAP Container Station, TrueNAS SCALE, or plain Linux + Docker)
- **Git** on the NAS (or clone from your PC and copy the folder)
- SSH access (recommended for easy redeploys)

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
docker compose exec app npx prisma db push
docker compose exec app npm run db:seed   # optional demo data
```

### 4. Open the app

Visit `http://<NAS-IP>:3000` from a device on your home network.

Register a household or use demo credentials if you ran seed: `demo@homebase.local` / `demo1234`.

---

## Redeploy after code changes

### Option A — Deploy from your PC (recommended)

From the repo root on Windows (NAS share reachable + SSH):

```powershell
npm run deploy:nas
```

Optional `.env` on your **Windows** machine (gitignored):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NAS_HOST` | `192.168.0.170` | NAS IP |
| `NAS_USER` | `wim` | SSH user |
| `NAS_PATH` | `/volume1/docker/homebase` | Path on the NAS |
| `NAS_SHARE` | `\\192.168.0.170\docker\homebase` | Windows SMB path to git checkout |
| `NAS_BRANCH` | `main` | Branch to pull / archive |

Variants:

```powershell
npm run deploy:nas -- -Push      # git push origin first
npm run deploy:nas -- -UseScp    # no share: tarball via scp
```

Git Bash: `./scripts/deploy-nas.sh` (same flow).

The script:

1. `git pull` on the NAS SMB share (or scp tarball)
2. SSH → `sudo docker compose up --build -d`
3. `prisma db push` inside the app container
4. Curl `/health` on port 3000

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
2. `prisma db push` — apply any schema changes

Your **database and uploads are preserved** in Docker volumes across redeploys.

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

Back up these Docker volumes periodically:

- `postgres_data` — all household data
- `uploads_data` — photos (plants, projects, etc.)

Example:

```bash
docker compose down
# Copy volume data from Docker's volume directory, or:
docker run --rm -v homebase_postgres_data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/postgres.tar.gz /data
docker compose up -d
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login redirects wrong | `AUTH_URL` must match the URL in your browser |
| Build fails on NAS | NAS CPU may be slow — first build can take 10–20 min |
| Out of memory during build | Build on your PC, push image to a registry, or increase NAS swap |
| Scheduler not running | Ensure `worker` container is up: `docker compose ps` |
| Hue not working | Set `HUE_BRIDGE_IP` in `.env`; NAS must be on same LAN as Hue bridge |

---

## Quick reference

```bash
docker compose ps              # status
docker compose logs -f app     # app logs
docker compose logs -f worker  # scheduler logs
docker compose down            # stop (data kept in volumes)
docker compose up -d --build   # rebuild and start
```
