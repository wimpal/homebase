# Reolink cameras (Smart Home → Cameras)

Homebase stores Reolink cameras as `Device` rows (`type: CAMERA`) with a
server-side config. Snapshots for the E1 Pro (and similar models without HTTP
CGI) are captured via **FFmpeg + RTSP** on the app container — never by
exposing the password to the browser.

## Prerequisites

1. **Device login (not app/cloud account)** — RTSP uses the **camera** username/password.
   - Username is almost always `admin` (lowercase), **not** your email.
   - Password is the one set when you first set up the camera (device password),
     **not** the Reolink account / app login password.
   - Check or change it: camera Settings → **Advanced** → **User Management**
     (desktop Client: Device Settings → System → User Management).
2. **Enable RTSP** — Network → Advanced → Server/Port Settings → RTSP on (port **554**).
   Often off by default; if the toggle is missing on phone, use the desktop Client.
   Restart the camera after enabling.
3. **Stable IP** — prefer a **DHCP reservation** for the camera MAC.
4. **LAN reachability** — Homebase **app** container must reach `camera-ip:554`.

If Homebase still fails: test in VLC first
(`rtsp://admin:DEVICE_PASSWORD@192.168.1.183:554/h264Preview_01_sub`).
When VLC works, delete and re-add the camera in Homebase (password is only stored at create).


## Add in the UI

Smart Home → Cameras → name, host/IP, username, password → Add.

Preview calls `GET /api/cameras/<id>/snapshot` (session + household scoped).
Credentials are never returned in page props.

## Ops notes

- App Docker image includes `ffmpeg` (`apk` in the runner stage). Redeploy after
  this change or snapshots fail with “FFmpeg is not installed”.
- Near-live preview: UI polls `/api/cameras/<id>/snapshot` every ~2s **only** while
  the Cameras tab is selected and the browser tab is visible; leaves abort the fetch.
- Substream preferred; domain also tries alternate Preview path names.
- No MCP camera tools in v1 — UI only.
