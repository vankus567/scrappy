"use client";

import { getConfig, savePush } from "./api";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const pushGranted = () => pushSupported() && Notification.permission === "granted";

/** Ask permission, subscribe this phone and store the subscription with the player. */
export async function enablePush(token: string) {
  if (!pushSupported()) throw new Error("This browser can't show notifications.");
  const { push_public_key } = await getConfig();
  if (!push_public_key) throw new Error("Notifications aren't switched on for this server yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser settings.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(push_public_key) }));
  await savePush(token, sub.toJSON());
}
