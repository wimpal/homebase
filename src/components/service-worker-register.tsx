"use client";

import { useEffect } from "react";

/**
 * Register the app service worker on load, once, regardless of auth state.
 * Registration no-ops/rejects on insecure origins — that is expected.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.warn("Service worker registration failed", error));
  }, []);

  return null;
}
