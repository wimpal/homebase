# Backup and restore (NAS)

Homebase stores household data in Docker volumes on the NAS. This guide covers
**scheduled backups**, **retention**, and a **restore drill** that proves backups work
without touching production.

**Production:** `http://<NAS-IP>:3000` — compose at `/volume1/docker/homebase`

---

## What is backed up

| Artifact | Source | Contents |
|----------|--------|----------|
| `postgres-YYYY-MM-DD.dump` | `pg_dump -Fc` (online) | All DB data: users, inventory, shopping, tasks, MCP change log |
| `uploads-YYYY-MM-DD.tar.gz` | `homebase_uploads_data` volume | Plant/project photos and other uploads |

**Not backed up (M4):** `redis_data` — no durable state; BullMQ is unused.

Verify volume names on your NAS:

```bash
ssh wim@192.168.1.142 "docker volume ls | grep -E 'homebase|postgres|uploads'"
```

Expected: `homebase_postgres_data`, `homebase_uploads_data`.

---

## Where backups live

Backups go to a folder **outside** the live compose tree:

```
/volume1/Docker-backups/homebase/
  postgres-2026-08-28.dump
  uploads-2026-08-28.tar.gz
  backup.log                  # optional cron log
```

Do not store backups only inside `/volume1/docker/homebase` or inside the same Docker
volume as production.

### One-time setup

Create the Homebase subfolder under the **Docker-backups** share (SMB: `\\<NAS-IP>\Docker-backups`):

```bash
mkdir -p /volume1/Docker-backups/homebase
```

---

## Automated backup

### Script

[`scripts/backup-nas.sh`](../scripts/backup-nas.sh) runs on the NAS:

```bash
cd /volume1/docker/homebase
chmod +x scripts/backup-nas.sh
./scripts/backup-nas.sh
```

It:

1. Dumps Postgres while the stack is running (no downtime)
2. Archives the uploads volume read-only
3. Prunes files older than **30 days** (override with `RETENTION_DAYS=30`)

### Schedule (daily recommended)

UGOS does not expose Task Scheduler in Control Panel on all models. Use **cron as root**
(plain `crontab` as `wim` fails with `Permission denied` on UGOS).

**One-time setup** — SSH in and run (enter your sudo password when prompted):

```bash
sudo tee /etc/cron.d/homebase-backup << 'EOF'
# Homebase daily backup — 03:00, runs as wim (docker group)
0 3 * * * wim /volume1/docker/homebase/scripts/backup-nas-cron.sh
EOF
sudo chmod 644 /etc/cron.d/homebase-backup
```

The wrapper [`scripts/backup-nas-cron.sh`](../scripts/backup-nas-cron.sh) sets `PATH` and
appends to `backup.log`.

**Verify:**

```bash
cat /etc/cron.d/homebase-backup
/volume1/docker/homebase/scripts/backup-nas-cron.sh
tail -20 /volume1/Docker-backups/homebase/backup.log
```

**Alternative — root crontab** (if `/etc/cron.d/` is not used on your build):

```bash
sudo crontab -e
```

Add:

```cron
0 3 * * * wim /volume1/docker/homebase/scripts/backup-nas-cron.sh
```

### Retention

- **30 daily** copies pruned by the script (`RETENTION_DAYS`, default 30)
- Optional: NAS Hyper Backup or similar for monthly off-NAS copies (operator choice)

### Manual backup

Run `./scripts/backup-nas.sh` before risky changes (schema push, major upgrades).

---

## Restore drill (non-production)

The drill restores a backup into an **isolated** stack on port **13000**. Production on
**:3000 is never modified**.

### Before you start

1. Confirm a recent backup exists in `/volume1/Docker-backups/homebase/`
2. On production (`:3000`), note one **inventory product name** or **shopping list item**
   you will look for after restore

### Run the drill

```bash
cd /volume1/docker/homebase
chmod +x scripts/restore-drill.sh
./scripts/restore-drill.sh 2026-08-28    # use your backup date stamp
```

The script:

1. Checks production `/health` on `:3000` (warns if down)
2. Starts `docker-compose.drill.yml` with fresh `drill_*` volumes
3. `pg_restore` into drill Postgres
4. Extracts uploads into `homebase-drill_drill_uploads_data`
5. Starts drill app on `:13000` and curls `/health`

### Spot-check

1. Open `http://<NAS-IP>:13000` (not `:3000`)
2. Log in with production credentials
3. Confirm your known inventory item or shopping list entry is present
4. Optionally open a photo upload if you use plant/project images

### Tear down

```bash
cd /volume1/docker/homebase
docker compose -p homebase-drill -f docker-compose.drill.yml down -v
```

Confirm production still works: `curl http://<NAS-IP>:3000/health`

---

## Drill log

Record each completed drill (required for M4 acceptance):

| Date | Backup stamp | Health | Spot-check | Notes |
|------|--------------|--------|------------|-------|
| 2026-08-28 | 2026-08-28 | `checks.db: ok` on :13000 | *confirm on :13000* | `restore-drill.sh` OK; production :3000 unchanged; tear down drill after spot-check |

Example row after a successful drill:

| Date | Backup stamp | Health | Spot-check | Notes |
|------|--------------|--------|------------|-------|
| 2026-08-28 | 2026-08-28 | `checks.db: ok` on :13000 | Inventory item "Milk" found | Production :3000 unchanged |

---

## Fallback: restore on dev PC

If port 13000 on the NAS is awkward, you can verify a dump locally:

```bash
# On your PC — copy dump from NAS first
scp wim@192.168.1.142:/volume1/Docker-backups/homebase/postgres-2026-08-28.dump .

createdb homebase_restore_test
pg_restore -d homebase_restore_test --no-owner postgres-2026-08-28.dump

# Point DATABASE_URL at homebase_restore_test, npm run dev, spot-check UI
```

Record the drill date in the table above and note "local PC restore" in Notes.

---

## Full disaster recovery (production)

Only when production is lost or you intentionally migrate to new hardware:

1. Install Docker and clone this repo to the new host
2. Create `.env` (same secrets as before, or rotate and accept re-login)
3. `docker compose up -d postgres redis` — wait for healthy Postgres
4. `pg_restore` into the **new** `homebase_postgres_data` volume (or pipe into `docker compose exec`)
5. Extract `uploads-*.tar.gz` into `homebase_uploads_data`
6. `docker compose up -d` (full stack)
7. `curl http://<host>:3000/health`

**Never** overwrite a running production volume in place without a drill first.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Zero-byte `.dump` | Postgres container down? Run `docker compose ps`. Check `docker compose logs postgres`. |
| `uploads_data` volume not found | Script uses `docker volume ls` (not `docker compose volume ls`). Verify: `docker volume ls \| grep homebase_uploads` |
| `pg_restore` errors on drill | Ensure drill was torn down with `down -v` before retry. |
| Port 13000 in use | Stop old drill: `docker compose -p homebase-drill -f docker-compose.drill.yml down -v` |
| Login redirect wrong on drill | `DRILL_AUTH_URL` in drill compose must match `http://<NAS-IP>:13000` |
| Large uploads tar slow | First run can take minutes; acceptable for M4 |

---

## Related

- [nas-deploy.md](nas-deploy.md) — deploy and redeploy
- [nas-pc-setup.md](nas-pc-setup.md) — SSH and `npm run deploy:nas`
