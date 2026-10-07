// HomeBase service worker
//
// Bump CACHE_NAME whenever any precached shell asset below changes, so
// activate() can drop the old cache and clients pick up the new shell.
//
// Offline scope: network-first for top-level document navigations only. This
// covers a cold start / full reload while offline (shows /offline.html). It does
// NOT cover App Router client-side soft navigations or RSC payloads, and this
// worker deliberately caches no authenticated pages, API responses, or Next
// chunk graph.

const CACHE_NAME = "homebase-shell-v1";

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("homebase-shell-") && key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Full document loads only (cold start / reload). Client-side route changes
  // and RSC fetches intentionally fall through to the network untouched.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((cached) => cached || Response.error())
      )
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "HomeBase", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
