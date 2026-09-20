# Reolink cameras (Smart Home → Cameras)

Homebase stores Reolink cameras as `Device` rows (`type: CAMERA`) with a
server-side config. Snapshots for the E1 Pro (and similar models without HTTP
CGI) are captured via **FFmpeg + RTSP** on the app container — never by
exposing the password to the browser.

## Prerequisites

1. **Local login** — username/password set in the Reolink app (UID alone is not enough).
2. **Enable RTSP** — Reolink app → camera settings → Network / advanced → RTSP on
   (default port **554**).
3. **Stable IP** — camera is often on DHCP. Prefer a **DHCP reservation** on the
   router for the camera MAC so the host you save in Homebase does not drift.
4. **LAN reachability** — the Homebase **app** container (NAS) must reach
   `camera-ip:554`. Same flat LAN as Dirigera.

## Add in the UI

Smart Home → Cameras → name, host/IP, username, password → Add.

Preview calls `GET /api/cameras/<id>/snapshot` (session + household scoped).
Credentials are never returned in page props.

## Ops notes

- App Docker image includes `ffmpeg` (`apk` in the runner stage). Redeploy after
  this change or snapshots fail with “FFmpeg is not installed”.
- Substream path used: `h264Preview_01_sub` (faster preview than main).
- No MCP camera tools in v1 — UI only.
