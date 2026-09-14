/* BlueFix – Firebase Cloud Messaging Service Worker */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCKLqJ-YW_PQ0MRFHQLMZaKWaPc28ScSE8",
  authDomain: "bluefix-2255.firebaseapp.com",
  projectId: "bluefix-2255",
  storageBucket: "bluefix-2255.firebasestorage.app",
  messagingSenderId: "317301627140",
  appId: "1:317301627140:web:cc37ea8ca5d7a8caf71851"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'BlueFix';
  const body = payload.notification?.body || payload.data?.body || 'Neue Benachrichtigung';
  const url = payload.data?.url || './';

  self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url },
    tag: payload.data?.tag || 'bluefix-push',
    renotify: true
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try { client.navigate(url); } catch (_) {}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
