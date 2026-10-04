import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import Navbar from '../components/Navbar'

// ── Map constants ─────────────────────────────────────────────────────────────

const HOSPITAL = { lat: 37.1533, lng: 9.7833, name: 'Menzel Bourguiba Regional Hospital' }

const AMBULANCE_BASES = [
  { lat: 37.1620, lng: 9.7710, label: 'North Station' },
  { lat: 37.1445, lng: 9.7950, label: 'East Unit'     },
  { lat: 37.1580, lng: 9.8020, label: 'Central Unit'  },
  { lat: 37.1390, lng: 9.7680, label: 'South Station' },
]

const WARDS = [
  { id: 'A', lat: 37.1540, lng: 9.7825, label: 'Ward A – Cardiology' },
  { id: 'B', lat: 37.1528, lng: 9.7840, label: 'Ward B – ICU'        },
  { id: 'C', lat: 37.1520, lng: 9.7820, label: 'Ward C – Emergency'  },
]

const ANIM_STEPS       = 80
const ANIM_INTERVAL_MS = 150

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t }

function haversineKm(a, b) {
  const R    = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function etaMinutes(distKm, speedKmh = 60) {
  return Math.ceil((distKm / speedKmh) * 60)
}

function buildRoute(from, to) {
  const midLat = (from.lat + to.lat) / 2 + (Math.random() - 0.5) * 0.008
  const midLng = (from.lng + to.lng) / 2 + (Math.random() - 0.5) * 0.008
  return Array.from({ length: ANIM_STEPS + 1 }, (_, i) => {
    const t = i / ANIM_STEPS
    const u = 1 - t
    return {
      lat: u * u * from.lat + 2 * u * t * midLat + t * t * to.lat,
      lng: u * u * from.lng + 2 * u * t * midLng + t * t * to.lng,
    }
  })
}

// Deterministic seed per patient so the same base/ward is used consistently
function seededPick(arr, seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return arr[h % arr.length]
}

// ── MapPanel — one Leaflet instance ──────────────────────────────────────────

function MapPanel({ patient, R }) {
  const mapRef      = useRef(null)
  const leafletMap  = useRef(null)
  const ambulanceMk = useRef(null)
  const animTimer   = useRef(null)
  const stepRef     = useRef(0)

  const [step,    setStep]    = useState(0)
  const [etaMins, setEtaMins] = useState(null)
  const [arrived, setArrived] = useState(false)

  const base   = seededPick(AMBULANCE_BASES, patient.id)
  const ward   = seededPick(WARDS,           patient.id)
  const route  = useRef(buildRoute(base, HOSPITAL))
  const distKm = haversineKm(base, HOSPITAL)

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    // Reset animation state when patient changes
    stepRef.current = 0
    setStep(0)
    setArrived(false)

    import('leaflet').then(L => {
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

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      // Hospital
      L.marker([HOSPITAL.lat, HOSPITAL.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:36px;height:36px;border-radius:50%;background:#dc2626;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:18px;">🏥</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        }),
      }).addTo(map).bindPopup(`<b>${HOSPITAL.name}</b><br/>${ward.label}`)

      // Ward
      L.marker([ward.lat, ward.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:28px;height:28px;border-radius:6px;background:#0d9488;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:bold;">${ward.id}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        }),
      }).addTo(map).bindPopup(`<b>${ward.label}</b><br/>Patient: ${patient.name}`)

      // Base
      L.marker([base.lat, base.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:50%;background:#374151;border:2px solid #9ca3af;display:flex;align-items:center;justify-content:center;font-size:12px;">📍</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        }),
      }).addTo(map).bindPopup(`Dispatch: ${base.label}`)

      // Ambulance
      ambulanceMk.current = L.marker([base.lat, base.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:34px;height:34px;border-radius:50%;background:#2563eb;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.5);font-size:18px;">🚑</div>`,
          iconSize: [34, 34], iconAnchor: [17, 17],
        }),
        zIndexOffset: 1000,
      }).addTo(map).bindPopup(`Ambulance dispatched from ${base.label}`)

      // Route line
      L.polyline(route.current.map(p => [p.lat, p.lng]), {
        color: '#3b82f6', weight: 3, dashArray: '8 6', opacity: 0.7,
      }).addTo(map)

      map.fitBounds([[base.lat, base.lng], [HOSPITAL.lat, HOSPITAL.lng]], { padding: [40, 40] })
      leafletMap.current = map
      setEtaMins(etaMinutes(distKm))

      // Animation
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
        const pos = route.current[s]
        ambulanceMk.current?.setLatLng([pos.lat, pos.lng])
        setEtaMins(Math.max(0, etaMinutes(distKm * (1 - s / ANIM_STEPS))))
      }, ANIM_INTERVAL_MS)
    })

    return () => {
      clearInterval(animTimer.current)
      leafletMap.current?.remove()
      leafletMap.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id])

  const progress    = Math.round((step / ANIM_STEPS) * 100)
  const anomaly     = patient.recent_anomalies?.[0] ?? {}
  const isCritical  = true

  return (
    <div className="flex flex-col h-full">

      {/* Patient header */}
      <div className="px-5 py-4 border-b border-gray-800 bg-red-950/30 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-xl border border-red-700 overflow-hidden shrink-0">
          {patient.photo_url
            ? <img src={patient.photo_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-red-900 flex items-center justify-center">
                <span className="text-red-300 text-sm font-bold">
                  {patient.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white font-semibold truncate">{patient.name}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-red-950 border-red-700 text-red-400 font-mono shrink-0">
              {anomaly.confidence}%
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-800 border-gray-700 text-gray-300 shrink-0">
              {anomaly.type}
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5">{ward.label} · {base.label}</p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-xl border font-medium shrink-0 ${
          arrived
            ? 'bg-green-950 border-green-800 text-green-400'
            : 'bg-blue-950 border-blue-800 text-blue-400 animate-pulse'
        }`}>
          {arrived ? R.onScene : R.enRoute}
        </span>
      </div>

      {/* Map */}
      <div ref={mapRef} className="flex-1 min-h-0" style={{ minHeight: 300 }} />

      {/* Status bar */}
      <div className="px-5 py-3 border-t border-gray-800 space-y-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-150" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-gray-500 font-mono shrink-0">{progress}%</span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-gray-500">{R.eta} </span>
            {arrived
              ? <span className="text-green-400 font-bold">{R.arrived}</span>
              : <span className="text-white font-bold font-mono">{etaMins !== null ? `~${etaMins} min` : '…'}</span>
            }
          </div>
          <div>
            <span className="text-gray-500">{R.distance} </span>
            <span className="text-white font-bold font-mono">{distKm.toFixed(1)} km</span>
          </div>
          <div>
            <span className="text-gray-500">{R.unit} </span>
            <span className="text-white font-medium">{base.label}</span>
          </div>
          {anomaly.timestamp && (
            <div className="ml-auto">
              <span className="text-gray-600 font-mono">
                {new Date(anomaly.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Patient list item ─────────────────────────────────────────────────────────

function AlertListItem({ patient, selected, onClick, R }) {
  const anomaly    = patient.recent_anomalies?.[0] ?? {}
  const isAfib     = anomaly.type?.toLowerCase().includes('atrial')
  const isST       = anomaly.type?.toLowerCase().includes('st')

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        selected
          ? 'border-red-700 bg-red-950'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-lg border border-red-800 overflow-hidden shrink-0">
          {patient.photo_url
            ? <img src={patient.photo_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-red-900 flex items-center justify-center">
                <span className="text-red-300 text-xs font-bold">
                  {patient.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-gray-200 text-sm font-medium truncate">{patient.name}</p>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          </div>
          <p className="text-red-400 text-xs truncate mt-0.5">{anomaly.type ?? R.alert}</p>
        </div>

        <span className="text-xs font-mono text-red-400 font-bold shrink-0">
          {anomaly.confidence}%
        </span>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmergencyResponse() {
  const { T } = useLanguage()
  const R = T.response
  const [email,    setEmail]    = useState('')
  const [patients, setPatients] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('patients')
      .select('id, name, photo_url, primary_diagnosis, ward, current_prediction, current_confidence, recent_anomalies')
      .eq('connection_status', 'connected')
      .neq('current_prediction', 'NORM')
      .not('current_prediction', 'is', null)
      .order('name')

    // Build a synthetic anomaly entry from current_prediction if recent_anomalies is empty
    const LABELS = { MI: 'Myocardial Infarction', STTC: 'ST/T Change', CD: 'Conduction Disorder', HYP: 'Hypertrophy' }
    const active = (data ?? []).map(p => ({
      ...p,
      recent_anomalies: p.recent_anomalies?.length > 0
        ? p.recent_anomalies
        : [{ type: LABELS[p.current_prediction] ?? p.current_prediction, confidence: p.current_confidence ?? 0, timestamp: new Date().toISOString() }],
    }))

    setPatients(active)
    setLoading(false)
    if (active.length > 0) setSelectedId(prev => prev ?? active[0].id)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
    fetchAlerts()

    // Realtime — refresh when anomalies change
    const ch = supabase
      .channel('er-anomalies')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'patients' }, fetchAlerts)
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [fetchAlerts])

  const selected = patients.find(p => p.id === selectedId)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar email={email} />

      <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-6 gap-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg leading-tight">{R.title}</h1>
            <p className="text-gray-500 text-xs">
              {loading ? R.loading : patients.length === 0
                ? R.noAlerts
                : `${patients.length} ${patients.length > 1 ? R.patientsActive : R.patientActive}`
              }
            </p>
          </div>
          {patients.length > 0 && (
            <span className="ml-auto text-xs px-2.5 py-1 rounded-full border border-red-700 bg-red-950 text-red-400 animate-pulse">
              {patients.length} {R.active}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm text-center py-12">{R.loading}</p>
        ) : patients.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <p className="text-gray-500 text-sm font-medium">{R.allClear}</p>
              <p className="text-gray-700 text-xs mt-1">{R.noAlertsAt}</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 flex-1 min-h-0" style={{ height: 'calc(100vh - 180px)' }}>

            {/* Left — patient list */}
            <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1 shrink-0">
                {R.activeAlerts}
              </p>
              {patients.map(p => (
                <AlertListItem
                  key={p.id}
                  patient={p}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                  R={R}
                />
              ))}
              <p className="text-gray-700 text-xs italic text-center mt-2 shrink-0">
                {R.simulationNote}
              </p>
            </div>

            {/* Right — map panel */}
            <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden min-w-0">
              {selected
                ? <MapPanel key={selected.id} patient={selected} R={R} />
                : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-gray-600 text-sm">{R.selectPatient}</p>
                  </div>
                )
              }
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
