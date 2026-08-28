# HomeBase

A self-hosted household management platform. Track inventory, manage tasks, care for plants and pets, plan shopping, schedule events, and integrate with smart home devices.

## Features

- **Inventory** - Product tracking, barcode scanning, locations, low-stock alerts
- **Shopping** - Smart lists with auto-population, store filtering, tags
- **Tasks** - Recurring chores with timers, projects with checklists and photos
- **Plants & Pets** - Watering schedules, appointments, feeding routines
- **Calendar** - Events with reminders, guests, prep lists, "last time" tracking
- **Routines** - Shared routines with dependencies, templates, gamification
- **Recipes** - Instructions, multiple timers, inventory-linked ingredients, leftovers
- **Budget** - Category budgets and expense tracking
- **Delivery** - Package tracking with arrival alerts
- **Messages** - Group chat, grocery/task requests, visitor preferences
- **Smart Home** - Sensor readings, window recommendations, Philips Hue, cameras
- **Module system** - Toggle features on/off per household
- **PWA** - Installable web app with push notifications

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- PostgreSQL + Prisma
- Auth.js (credentials)
- Tailwind CSS + shadcn-style components
- Docker Compose for self-hosting
- node-cron worker for scheduled jobs

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- PostgreSQL (or use Docker Compose)

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start database (optional - if using Docker)
docker compose up postgres -d

# Push schema to database
npm run db:push

# Seed demo data
npm run db:seed

# Start dev server
npm run dev

# In another terminal, start background worker
npm run worker
```

Open [http://localhost:3000](http://localhost:3000)

**Demo login:** `demo@homebase.local` / `demo1234`

## Production (Docker / NAS)

Full NAS guide: **[docs/nas-deploy.md](docs/nas-deploy.md)**

```bash
cp .env.example .env
# Edit .env — set AUTH_SECRET, AUTH_URL (NAS IP), POSTGRES_PASSWORD

docker compose up -d --build
docker compose exec worker npx prisma db push
docker compose exec app npm run db:seed   # optional

# Redeploy after changes (on NAS):
./scripts/deploy.sh

# Redeploy from your PC via SSH:
# .\scripts\deploy-remote.ps1 -NasHost 192.168.1.50 -NasUser admin -NasPath /volume1/docker/homebase
```

## Roadmap

Feature audit, implementation phases, and build order: **[docs/roadmap.md](docs/roadmap.md)**

**Current phase:** Phase 0 (product contract) is complete. Next up: Phase 1 — secure household tenancy and authorization.

**Supported deployments:** Local dev (`npm run dev` + `npm run worker`) and Docker Compose on a NAS. See **[docs/release.md](docs/release.md)** for the deployment matrix and release process.

## Project Structure

```
src/
  app/           # Next.js routes
  core/          # Auth, DB, modules, notifications, scheduler
  modules/       # Feature-specific server actions
  components/    # UI components
prisma/          # Database schema
worker/          # Background job process
public/          # PWA manifest, service worker
```

## Environment Variables

See `.env.example` for all options. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret for Auth.js |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `HUE_BRIDGE_IP` | Philips Hue bridge IP (optional) |
| `HUE_USERNAME` | Hue API username (optional) |

## License

Private - for personal household use.
