"use client";

import { getConfig, savePush } from "./api";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Ask permission, subscribe this device and store the subscription with the worker. */
export async function enablePush(token: string) {
  if (!pushSupported()) throw new Error("This browser can't receive task notifications.");
  const { push_public_key } = await getConfig();
  if (!push_public_key) throw new Error("Notifications are not switched on for this Scrappy server yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(push_public_key) }));
  await savePush(token, sub.toJSON());
}
