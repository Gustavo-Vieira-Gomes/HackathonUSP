/* global self, URL */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (
    !payload ||
    typeof payload.title !== 'string' ||
    typeof payload.body !== 'string'
  )
    return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url;
  try {
    url = new URL(event.notification.data?.url || '/', self.location.origin);
  } catch {
    return;
  }
  if (
    url.origin !== self.location.origin ||
    !/^\/paciente\/vagas\/[^/]+$/.test(url.pathname)
  )
    return;
  event.waitUntil(self.clients.openWindow(url.href));
});
