// Push notifications only. There is deliberately no fetch handler: pages are signed in per person,
// so nothing here may cache or answer a navigation.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Tracklet", {
      body: data.body,
      icon: data.icon || "/icons/192",
      tag: data.tag,
      data: { url: data.url || "/alerts" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/alerts", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      // Reuse an open Tracklet tab or window rather than piling up new ones.
      return open ? open.focus().then((w) => w.navigate(url)) : self.clients.openWindow(url);
    })
  );
});
