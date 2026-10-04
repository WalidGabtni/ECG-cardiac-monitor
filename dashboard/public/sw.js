/* ECG Dashboard — Service Worker
 * Handles two notification paths:
 *   1. postMessage from main thread  → show notification even when tab is in background
 *   2. Push event (future VAPID)     → server-initiated alerts
 */

const DASHBOARD_URL = '/dashboard'

// ── postMessage from main thread ──────────────────────────────────────────────
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'NOTIFY') return

  const { title, body, critical = false, tag = 'ecg-alert' } = event.data

  self.registration.showNotification(title, {
    body,
    icon: '/heart.svg',
    badge: '/heart.svg',
    tag,
    requireInteraction: critical,
    vibrate: critical ? [200, 100, 200] : undefined,
  })
})

// ── Push (server-side VAPID, future use) ─────────────────────────────────────
self.addEventListener('push', event => {
  let payload = { title: 'ECG Alert', body: 'New alert from your patient.' }
  try { payload = event.data?.json() ?? payload } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:               payload.body,
      icon:               '/heart.svg',
      badge:              '/heart.svg',
      tag:                payload.tag ?? 'ecg-push-alert',
      requireInteraction: payload.critical ?? false,
      vibrate:            payload.critical ? [200, 100, 200] : undefined,
      data:               { url: DASHBOARD_URL },
    })
  )
})

// ── Notification click → focus / open the dashboard tab ──────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = event.notification.data?.url ?? DASHBOARD_URL

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // If a dashboard tab is already open, focus it
        const existing = windowClients.find(c => c.url.includes(target))
        if (existing) return existing.focus()
        // Otherwise open a new tab
        return clients.openWindow(target)
      })
  )
})

// ── Activate immediately (no waiting for old SW to die) ──────────────────────
self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(clients.claim()))
