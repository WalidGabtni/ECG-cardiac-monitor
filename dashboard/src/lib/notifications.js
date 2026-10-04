import { supabase } from './supabase'

// ── Service-worker registration ───────────────────────────────────────────────

let swReady = false   // true once the SW is controlling the page

async function ensureSW() {
  if (swReady) return true
  if (!('serviceWorker' in navigator)) return false

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    // Wait for the SW to be ready to control the page
    await navigator.serviceWorker.ready
    swReady = true
    console.log('[SW] registered:', reg.scope)
    return true
  } catch (err) {
    console.warn('[SW] registration failed:', err)
    return false
  }
}

// Kick off SW registration as soon as this module is imported (non-blocking)
ensureSW()

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications')
    return false
  }

  if (Notification.permission === 'granted') {
    await ensureSW()
    return true
  }

  const permission = await Notification.requestPermission()
  if (permission === 'granted') await ensureSW()
  return permission === 'granted'
}

// ── Send notification ─────────────────────────────────────────────────────────

export function sendNotification(title, body, critical = false) {
  if (Notification.permission !== 'granted') return

  const controller = navigator.serviceWorker?.controller

  if (controller) {
    // Route through the service worker so it works in background tabs too
    controller.postMessage({ type: 'NOTIFY', title, body, critical, tag: 'ecg-alert' })
  } else {
    // Fallback: direct Notification API (foreground only)
    const n = new Notification(title, {
      body,
      icon: '/heart.svg',
      tag: 'ecg-alert',
      requireInteraction: critical,
    })
    n.onclick = () => { window.focus(); n.close() }
  }
}

// ── Alert email (Supabase Edge Function) ─────────────────────────────────────

export async function sendAlertEmail(patientName, anomalyType, confidence, eta) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const res = await supabase.functions.invoke('send-alert-email', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      doctorEmail: session.user.email,
      patientName: patientName ?? 'Unknown Patient',
      anomalyType,
      confidence,
      eta: eta || 'Unknown',
    },
  })

  console.log('Email function response:', res)
}
