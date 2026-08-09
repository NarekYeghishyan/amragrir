/* Service worker for order alerts, and nothing else.
 *
 * It caches nothing, intercepts no requests and does not make this app work
 * offline. It exists because **Android Chrome refuses `new Notification()`** and
 * will only show one through `ServiceWorkerRegistration.showNotification()` —
 * and a phone with the site open is exactly the case the alert is for. Desktop
 * would work either way; going through the worker means one code path rather
 * than two, and the click below behaves the same on both.
 *
 * It is deliberately not a PWA. Adding a fetch handler would put this worker in
 * front of every request the site makes, which is a large thing to take on for
 * a bell — and a broken one serves a stale site to everybody with no way to
 * clear it. See apps/web/README.md.
 */

// Take over without waiting for every tab to be closed first. Safe precisely
// because this worker controls nothing: there is no cached response that could
// be served by two versions at once.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* Opens the order the alert was about.
 *
 * Focuses a tab that is already on this site rather than opening a second one —
 * somebody who has the site open in a tab does not want a duplicate of it, and
 * `navigate()` puts the existing tab on the right page. A new window is the
 * fallback for when there is genuinely nothing open.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus().then(() => ('navigate' in client ? client.navigate(url) : null));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
