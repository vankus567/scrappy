// Scrappy service worker: battle and task notifications only. No caching of API data.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Scrappy" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Scrappy", {
      body: data.body || "Your pet needs you.",
      tag: data.tag || "scrappy",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/app/battle" },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/battle";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) { w.navigate(url); return w.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
