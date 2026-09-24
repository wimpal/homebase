# Home network LAN scan (T-110)

ADMIN-only **Scan network** on `/network` discovers live hosts on a configured
private subnet. Candidates are **not** enrolled until you confirm type + location.

## Configure

Set in `.env` (and restart the app container):

```bash
HOME_NETWORK_SCAN_CIDR=192.168.1.0/24
```

Rules:

- RFC1918 private only (`10/8`, `172.16–31/12`, `192.168/16`)
- Prefix **24–30** (at most 254 hosts)
- Required to start a scan — Homebase will not invent a subnet

## How discovery works

1. Concurrent ICMP ping of every host in the CIDR (wall clock ~25s)
2. Enrich MAC from the container ARP / neighbor table when present
3. Optional reverse DNS for hostname
4. Match against enrolled `NetworkDevice` rows (MAC first; else IP+hostname;
   IP-only → **ambiguous**)

Nothing is written to the database until you click enroll on a candidate.

## Docker / Synology LAN reachability

The `app` service stays on the Compose **bridge** network so it can resolve
`postgres` by DNS. Do **not** set `network_mode: host` on `app` by default —
that breaks the database URL.

Outbound pings from the container to your LAN usually work on Synology. If scan
reports “Network unreachable”:

1. Confirm `HOME_NETWORK_SCAN_CIDR` matches the household LAN
2. Confirm the NAS can reach that subnet (same class of issue as Dirigera —
   see `docs/dirigera-setup.md`)
3. Guest / IoT VLANs are out of scope for v1 — do not point CIDR at them by
   default

The production image includes `iputils-ping` and `iproute2` for ICMP + neighbor
lookups.

## Security

- ADMIN-only; MEMBER cannot start a scan
- Rate limit: one scan at a time per household; 60s cooldown after finish
- MAC / IP / hostname on enrolled rows are **UI-only** — MCP `homebase.devices.*`
  never returns them (ADR-021)
- No MCP `devices.scan` tool in v1
