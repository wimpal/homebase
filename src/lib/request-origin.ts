/**
 * Origin of the browser's request, derived from headers rather than
 * `request.url`. Next builds `request.url` from the server's bind hostname
 * (e.g. `0.0.0.0` in standalone/Docker), not the browser's Host header, so
 * redirecting on `new URL(request.url).origin` sends users to an unreachable
 * host. Prefer `x-forwarded-*` so reverse-proxy / HTTPS deploys keep working.
 */
export function getRequestOrigin(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
