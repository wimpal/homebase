"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PushNotificationSetup() {
  const [status, setStatus] = useState<string>("");

  async function subscribe() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push notifications not supported in this browser");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setStatus("VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Notification permission denied");
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setStatus(res.ok ? "Subscribed to push notifications!" : "Failed to save subscription");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Subscription failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Push Notifications</CardTitle>
        <CardDescription>Get reminders on your device (install as PWA for best results)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={subscribe}>Enable Push Notifications</Button>
        {status && <p className="text-sm text-zinc-500">{status}</p>}
      </CardContent>
    </Card>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
