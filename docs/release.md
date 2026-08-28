# HomeBase release & deployment

This document defines **how we name releases**, **what to verify before tagging**, and **which deployment targets we support**. Strategic build order and phase exit gates live in [roadmap.md](roadmap.md).

**Related docs:** [README](../README.md) · [AGENTS.md](../AGENTS.md) · [NAS deployment](nas-deploy.md)

---

## Milestone naming

HomeBase uses semantic version tags tied to roadmap phases. **Only tag a release when the preceding exit gate has evidence** (tests, a deployment log, or a restore/smoke-test record).

| Tag | Phases | Outcome |
|-----|--------|---------|
| `v0.2.0-foundation` | 0–2 | Safe engineering baseline |
| `v0.3.0-operations` | 3 | Maintainable self-hosted instance |
| `v0.4.0-households` | 4 | Real shared households |
| `v0.5.0-mobile` | 5 | Reliable daily phone usage |
| `v0.6.0-daily-workflows` | 6 | Inventory, shopping, tasks, and calendar daily loop |
| `v0.7.0-life-management` | 7 | Care, meals, routines, and budget |
| `v0.8.0-connected-home` | 8 | Messages, delivery, and smart home |
| `v1.0.0-homebase` | 9 + audit | Stable supported product |

Do not skip phases. A later feature does not justify releasing before its prerequisite gate is met.

---

## Release checklist

Run these steps in order before tagging:

1. **Confirm the phase exit gate** in [roadmap.md](roadmap.md) is met for the target release.
2. **Apply schema changes:**
   - Today: `npm run db:push` (dev) or `docker compose exec worker npx prisma db push` (NAS)
   - After Phase 2: `prisma migrate deploy` replaces `db push` in production
3. **Quality gates:** `npm run lint` and `npm run build`
4. **Tests:** run automated tests when they exist (Phase 2); until then, manual smoke only
5. **Deploy:** use [scripts/deploy.sh](../scripts/deploy.sh) on the NAS or follow [nas-deploy.md](nas-deploy.md)
6. **Smoke on target environment:**
   - Login with a household account
   - Open dashboard
   - Create and complete one daily item (e.g. shopping item or chore)
   - Confirm the worker process is running (scheduled alerts depend on it)
7. **Record evidence** (what was checked, when, on which environment) and write release notes covering behavior changes, migrations, environment changes, known limitations, and upgrade steps

### Release evidence (required before tagging)

Record these items alongside the checklist above. Full detail is in the roadmap; this is the shipper's short list:

- Schema migration tested against production-like data; rollback/recovery procedure documented
- `npm run lint`, `npm run build`, Prisma validation, and tests/smoke passing (CI when available)
- Authorization test: a user cannot read or mutate another household's data via IDs, nested resources, uploads, or module actions
- Mobile smoke: login, dashboard, create/complete a daily item, sign-out
- Worker jobs observed for one schedule interval without duplicate notifications or unhandled errors
- Backup created and restored into a clean environment; database and uploads verified
- Release notes listing behavior changes, migrations, env changes, known limitations, and upgrade steps

---

## Supported deployment matrix

| Environment | How | Required processes | Notes |
|-------------|-----|--------------------|-------|
| **Local development** | `npm run dev` + PostgreSQL | Next.js app + `npm run worker` | Worker is a separate terminal; scheduled alerts do not run without it |
| **Docker Compose on NAS** | `docker compose up -d --build` | `app`, `worker`, `postgres` | Canonical production path; see [nas-deploy.md](nas-deploy.md). `redis` is present in compose but unused until Phase 3 |
| **Unsupported** | Hosted SaaS, multi-node without shared DB/volumes | — | Out of v1 scope |

### Architecture ownership

| Path | Responsibility |
|------|----------------|
| `src/core/` | Auth, tenancy, modules, notifications, scheduler, uploads |
| `src/modules/` | Household feature server actions |
| `src/app/` | Routes and UI composition |
| `worker/` | Background process entry (scheduler) |

Prefer extending `src/core/` for cross-cutting infrastructure rather than duplicating logic in feature modules.

---

## Current status

| Item | Status |
|------|--------|
| Phase 0 — Product contract | **Complete** |
| Next phase | Phase 1 — Secure household tenancy & authorization |
