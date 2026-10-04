import { useEffect, useRef, useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

// Menzel Bourguiba Regional Hospital
const HOSPITAL = { lat: 37.1533, lng: 9.7833, name: 'Menzel Bourguiba Regional Hospital' }

// Simulated ambulance dispatch points around the city
const AMBULANCE_BASES = [
  { lat: 37.1620, lng: 9.7710, label: 'North Station' },
  { lat: 37.1445, lng: 9.7950, label: 'East Unit' },
  { lat: 37.1580, lng: 9.8020, label: 'Central Unit' },
  { lat: 37.1390, lng: 9.7680, label: 'South Station' },
]

// Patient wards inside the hospital (slight offsets from centre)
const WARDS = [
  { id: 'A', lat: 37.1540, lng: 9.7825, label: 'Ward A – Cardiology' },
  { id: 'B', lat: 37.1528, lng: 9.7840, label: 'Ward B – ICU' },
  { id: 'C', lat: 37.1520, lng: 9.7820, label: 'Ward C – Emergency' },
]

// How many steps to animate along the route
const ANIM_STEPS = 80
const ANIM_INTERVAL_MS = 150   // ms between steps → ~12 s total animation

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t }

function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function etaMinutes(distKm, speedKmh = 60) {
  return Math.ceil((distKm / speedKmh) * 60)
}

// Build a curved path between two points with slight random waypoints
function buildRoute(from, to) {
  const points = []
  const midLat = (from.lat + to.lat) / 2 + (Math.random() - 0.5) * 0.008
  const midLng = (from.lng + to.lng) / 2 + (Math.random() - 0.5) * 0.008
  for (let i = 0; i <= ANIM_STEPS; i++) {
    const t = i / ANIM_STEPS
    // Quadratic bezier: from → mid → to
    const u = 1 - t
    points.push({
      lat: u * u * from.lat + 2 * u * t * midLat + t * t * to.lat,
      lng: u * u * from.lng + 2 * u * t * midLng + t * t * to.lng,
    })
  }
  return points
}

// ── EmergencyMap ─────────────────────────────────────────────────────────────

/**
 * Props:
 *   alertType   — 'Atrial fibrillation' | 'ST elevation'
 *   patientName — string
 *   confidence  — number
 *   onDismiss   — () => void
 */
export default function EmergencyMap({ alertType, patientName, confidence, onDismiss }) {
  const mapRef      = useRef(null)
  const leafletMap  = useRef(null)
  const ambulanceMk = useRef(null)
  const routeLine   = useRef(null)
  const animTimer   = useRef(null)

  const [step,       setStep]       = useState(0)
  const [totalSteps] = useState(ANIM_STEPS)
  const [etaMins,    setEtaMins]    = useState(null)
  const [arrived,    setArrived]    = useState(false)
  const [base]       = useState(() => AMBULANCE_BASES[Math.floor(Math.random() * AMBULANCE_BASES.length)])
  const [ward]       = useState(() => WARDS[Math.floor(Math.random() * WARDS.length)])
  const [route]      = useState(() => buildRoute(base, HOSPITAL))
  const [distKm]     = useState(() => haversineKm(base, HOSPITAL))
  const stepRef      = useRef(0)

  // ── Initialise Leaflet (runs once after mount) ──────────────────────────────
  useEffect(() => {
    if (leafletMap.current) return   // already init'd

    // Dynamically import Leaflet so we don't need SSR handling
    import('leaflet').then(L => {
      // Fix default icon paths broken by bundlers
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current, {
        center:          [HOSPITAL.lat, HOSPITAL.lng],
        zoom:            14,
        zoomControl:     true,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      // Hospital marker (red cross)
      const hospitalIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:#dc2626;border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:18px;">
          🏥
        </div>`,
        iconSize:   [36, 36],
        iconAnchor: [18, 18],
      })
      L.marker([HOSPITAL.lat, HOSPITAL.lng], { icon: hospitalIcon })
        .addTo(map)
        .bindPopup(`<b>${HOSPITAL.name}</b><br/>${ward.label}`)
        .openPopup()

      // Ward marker (inside hospital)
      const wardIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:6px;
          background:#0d9488;border:2px solid #fff;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);color:#fff;font-size:10px;font-weight:bold;">
          ${ward.id}
        </div>`,
        iconSize:   [28, 28],
        iconAnchor: [14, 14],
      })
      L.marker([ward.lat, ward.lng], { icon: wardIcon })
        .addTo(map)
        .bindPopup(`<b>${ward.label}</b><br/>Patient: ${patientName}`)

      // Ambulance marker (starts at base)
      const ambIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:34px;height:34px;border-radius:50%;
          background:#2563eb;border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);font-size:18px;
          animation:pulse 1s infinite;">
          🚑
        </div>`,
        iconSize:   [34, 34],
        iconAnchor: [17, 17],
      })
      ambulanceMk.current = L.marker([base.lat, base.lng], { icon: ambIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<b>Ambulance dispatched</b><br/>From: ${base.label}`)

      // Route line (dashed blue)
      routeLine.current = L.polyline(
        route.map(p => [p.lat, p.lng]),
        { color: '#3b82f6', weight: 3, dashArray: '8 6', opacity: 0.7 }
      ).addTo(map)

      // Base marker
      const baseIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:#374151;border:2px solid #9ca3af;
          display:flex;align-items:center;justify-content:center;
          font-size:12px;">
          📍
        </div>`,
        iconSize:   [24, 24],
        iconAnchor: [12, 12],
      })
      L.marker([base.lat, base.lng], { icon: baseIcon })
        .addTo(map)
        .bindPopup(`Dispatch: ${base.label}`)

      // Fit map to show both hospital and base
      map.fitBounds([
        [base.lat, base.lng],
        [HOSPITAL.lat, HOSPITAL.lng],
      ], { padding: [40, 40] })

      leafletMap.current = map

      // ── Start animation ───────────────────────────────────────────────────
      const initialEta = etaMinutes(distKm)
      setEtaMins(initialEta)

      animTimer.current = setInterval(() => {
        stepRef.current += 1
        const s = stepRef.current
        setStep(s)

        if (s >= ANIM_STEPS) {
          clearInterval(animTimer.current)
          setArrived(true)
          setEtaMins(0)
          ambulanceMk.current?.setLatLng([HOSPITAL.lat, HOSPITAL.lng])
          return
        }

        const pos = route[s]
        ambulanceMk.current?.setLatLng([pos.lat, pos.lng])

        // Update ETA proportionally
        const remaining = distKm * (1 - s / ANIM_STEPS)
        setEtaMins(Math.max(0, etaMinutes(remaining)))
      }, ANIM_INTERVAL_MS)
    })

    return () => {
      clearInterval(animTimer.current)
      leafletMap.current?.remove()
      leafletMap.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const progress = Math.round((step / totalSteps) * 100)
  const isCritical = alertType === 'Atrial fibrillation' || alertType === 'ST elevation'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-800 ${
          isCritical ? 'bg-red-950/50' : 'bg-gray-900'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white font-semibold">{alertType}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
                  isCritical
                    ? 'bg-red-950 border-red-700 text-red-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400'
                }`}>{confidence}%</span>
              </div>
              <p className="text-gray-400 text-sm mt-0.5">
                Patient: <span className="text-white font-medium">{patientName}</span>
                <span className="text-gray-600 mx-2">·</span>
                <span className="text-gray-500">{ward.label}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Map */}
        <div ref={mapRef} style={{ height: 320 }} className="w-full" />

        {/* Status bar */}
        <div className="px-5 py-4 border-t border-gray-800 space-y-3">

          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 font-mono shrink-0">{progress}%</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* ETA */}
              <div>
                <p className="text-gray-500 text-xs">ETA</p>
                {arrived ? (
                  <p className="text-green-400 text-sm font-bold">Arrived ✓</p>
                ) : (
                  <p className="text-white text-sm font-bold font-mono">
                    {etaMins !== null ? `~${etaMins} min` : '…'}
                  </p>
                )}
              </div>
              {/* Distance */}
              <div>
                <p className="text-gray-500 text-xs">Distance</p>
                <p className="text-white text-sm font-bold font-mono">{distKm.toFixed(1)} km</p>
              </div>
              {/* Unit */}
              <div>
                <p className="text-gray-500 text-xs">Unit</p>
                <p className="text-white text-sm font-medium">{base.label}</p>
              </div>
            </div>

            {/* Status badge */}
            <span className={`text-xs px-3 py-1.5 rounded-xl border font-medium ${
              arrived
                ? 'bg-green-950 border-green-800 text-green-400'
                : 'bg-blue-950 border-blue-800 text-blue-400 animate-pulse'
            }`}>
              {arrived ? '✓ On scene' : '🚑 En route'}
            </span>
          </div>

          {/* Simulation notice */}
          <p className="text-gray-700 text-xs text-center">
            Simulation mode · Live GPS tracking available with real device deployment
          </p>
        </div>
      </div>
    </div>
  )
}
