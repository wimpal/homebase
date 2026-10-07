# HomeBase as an installable PWA

HomeBase ships a web app manifest, raster icons, and a hand-rolled service
worker (`public/sw.js`). You can add it to a phone or tablet home screen and open
it as a standalone app with the emerald HomeBase chrome.

**Secure-context caveat (read first).** Service workers, Web Push, and Android's
install criteria require a **secure context** — HTTPS, or `localhost`. The
household URLs (`http://<LAN-IP>:3000`, or HTTP MagicDNS) are **not** secure
contexts, so on plain HTTP:

- **iOS Safari** can still *Add to Home Screen* with the correct icon and
  standalone chrome (icons + `apple-mobile-web-app-*` meta do not need HTTPS).
- **Android Chrome** install, the service worker, offline fallback, and Web Push
  will not activate.

To enable the full set on phones, terminate TLS in front of port 3000 — see
**[nas-deploy.md](nas-deploy.md) § Reverse proxy + HTTPS**. This task does not
change `AUTH_URL` or force an HTTPS cutover; that is an operator decision.

## Install

### iOS Safari

1. Open the HomeBase URL in Safari.
2. Tap **Share** → **Add to Home Screen**.
3. Confirm the icon and name (**HomeBase**), then **Add**.
4. Launch from the home screen — it opens standalone at `/dashboard` (or the
   login screen first, then `/dashboard`).

### Android Chrome (requires a secure origin)

1. Open the HomeBase **HTTPS** URL in Chrome.
2. Tap the **⋮** menu → **Install app** / **Add to Home screen** (Chrome may also
   show an install prompt).
3. Confirm and launch. It opens standalone at `/dashboard`.

There is no in-app "Install" banner in v1 (`beforeinstallprompt` is intentionally
not used); install happens from the browser menu.

## Offline behaviour

The service worker is **network-first for full document loads** (`request.mode ===
"navigate"`). If the network is unavailable during a cold start or a full reload,
it serves the precached `public/offline.html` — a bilingual EN/NL message with a
retry button — instead of a blank screen.

What is **not** covered in v1:

- App Router client-side soft navigations and RSC payloads (they need the
  network).
- Any household data, API responses, uploads, or authenticated HTML — the worker
  deliberately caches **no** household data and is not a second source of truth.

## Icons

| Asset | Purpose |
|---|---|
| `public/icons/icon-192.png`, `icon-512.png` | `purpose: any` (rounded emerald square, white house) |
| `public/icons/icon-192-maskable.png`, `icon-512-maskable.png` | `purpose: maskable` (full-bleed, glyph in safe zone) |
| `public/icons/apple-touch-icon.png` (180×180) | iOS home screen |
| `public/icon.svg` | Optional vector `any` icon |

Notification icons use `/icons/icon-192.png`.

## Theme colour vs Appearance

`theme_color` in the static manifest and the default `viewport.themeColor` are
light primary `#047857`. A small client component (`ThemeColorMeta`) keeps a
single, media-less `meta[name="theme-color"]` in sync with the resolved
Appearance: `#047857` in light, `#34d399` in dark. This is intentional — a stored
dark preference must win over `prefers-color-scheme` in the browser chrome, so we
avoid dual `media`-scoped theme-color tags.

## Service worker updates

`public/sw.js` calls `skipWaiting()` on install and `clients.claim()` on activate,
so a new worker takes over on the next load. It also uses a **versioned cache**:

```js
const CACHE_NAME = "homebase-shell-v1";
```

**Bump `CACHE_NAME` whenever any precached shell asset changes** (offline page,
icons, manifest). On `activate`, older `homebase-shell-*` caches are deleted, so
operators are not stranded on a stale shell. During a deploy, a reload or two may
be needed before all clients pick up the new worker.
