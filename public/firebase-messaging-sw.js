// Firebase Messaging Service Worker
// File: public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDgdRv7WIPGn3h2n3-Yk66ex53qdaF8A-0",
  authDomain: "porto-danni.firebaseapp.com",
  projectId: "porto-danni",
  storageBucket: "porto-danni.appspot.com",
  messagingSenderId: "871082649796",
  appId: "1:871082649796:web:f32d9995df944bbd5c4191"
});

const messaging = firebase.messaging();

// Gestisce notifiche quando l'app è in background / chiusa
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Notifica in background ricevuta:', payload);

  const notificationTitle = payload.notification?.title || 'Porto Danni';
  const notificationOptions = {
    body: payload.notification?.body || 'Nuovo evento nel porto',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: payload.data,
    actions: [
      { action: 'open', title: 'Apri app' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Click sulla notifica: apre o porta in primo piano l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
