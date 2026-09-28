// Service Worker notifiche push — Porto Danni
// File: public/firebase-messaging-sw.js
// Gestisce direttamente l'evento "push" (senza SDK Firebase) per avere pieno controllo:
// - mostra SEMPRE il banner di sistema (obbligatorio su iPhone, altrimenti iOS revoca le notifiche)
// - avvisa l'app aperta così può suonare e mostrare il banner interno

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { data: { body: event.data ? event.data.text() : '' } };
  }
  const d = payload.data || {};
  const n = payload.notification || {};
  const title = d.title || n.title || 'Porto Danni';
  const body  = d.body  || n.body  || 'Nuovo evento nel porto';
  const url   = d.url   || '/';
  const tag   = d.tag   || ('porto-' + Date.now());

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Avvisa l'app aperta (suono + banner interno)
    clientList.forEach((c) => c.postMessage({ type: 'PUSH_RECEIVED', title, body, data: d }));

    await self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag,
      renotify: true,
      requireInteraction: true,      // il banner resta finché non viene toccato (Android/desktop)
      vibrate: [300, 120, 300, 120, 300],
      silent: false,                  // sempre con suono: su iPhone una notifica "silenziosa" non accende lo schermo
      timestamp: Date.now(),
      data: { url },
    });
  })());
});

// Tocco sulla notifica: apre l'app o la porta in primo piano
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
