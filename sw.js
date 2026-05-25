// TrainLog v5 — Service Worker avec Push Notifications
const CACHE = 'trainlog-v5';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// ─── INSTALL & ACTIVATE ───────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── FETCH (offline support) ──────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  // Ne pas cacher les appels API
  const url = e.request.url;
  if (url.includes('api.sncf.com') ||
      url.includes('workers.dev') ||
      url.includes('fonts.googleapis.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ─── PUSH NOTIFICATION REÇUE ──────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { title: 'TrainLog', body: e.data?.text() || '' }; }

  const title   = data.title || '🚉 TrainLog';
  const options = {
    body:    data.body    || '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    data:    data.data    || {},
    actions: data.data?.tchooUrl ? [
      { action: 'view-map', title: '🗺 Voir sur la carte' },
      { action: 'close',    title: '✕ Fermer' },
    ] : [
      { action: 'close', title: '✕ Fermer' },
    ],
    requireInteraction: true,
    tag: `trainlog-${data.data?.trainNumber || 'notif'}`,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ─── CLIC SUR UNE NOTIFICATION ────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action   = e.action;
  const tchooUrl = e.notification.data?.tchooUrl;
  const appUrl   = self.location.origin + '/';

  const urlToOpen = (action === 'view-map' && tchooUrl) ? tchooUrl : appUrl;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si l'app est déjà ouverte → focus
      for (const client of windowClients) {
        if (client.url.startsWith(appUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvre une nouvelle fenêtre
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// ─── SUBSCRIPTION EXPIRÉE ─────────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(subscription => {
        // Notifie l'app pour ré-enregistrer la subscription
        return self.clients.matchAll().then(clients => {
          clients.forEach(c => c.postMessage({
            type: 'SUBSCRIPTION_CHANGED',
            subscription: subscription.toJSON(),
          }));
        });
      })
  );
});
