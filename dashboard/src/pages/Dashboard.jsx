import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { playBeep } from '../lib/beep'
import { requestPermission, sendNotification, sendAlertEmail } from '../lib/notifications'
import Navbar from '../components/Navbar'
import ECGChart from '../components/ECGChart'
import AlertLog from '../components/AlertLog'
import VitalsChart from '../components/VitalsChart'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function nowTime() {
  const n = new Date()
  return (
    n.getHours().toString().padStart(2, '0') + ':' +
    n.getMinutes().toString().padStart(2, '0') + ':' +
    n.getSeconds().toString().padStart(2, '0')
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConnDot({ status }) {
  const cls = {
    connected:    'bg-green-400',
    simulated:    'bg-teal-400',
    reconnecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-gray-600',
  }
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls[status] ?? 'bg-gray-600'}`} />
}

// Ordered by clinical severity: NORM → HYP → CD → STTC → MI
const PREDICTION_STYLES = {
  NORM: { bg: 'bg-green-950',  border: 'border-green-700',  text: 'text-green-400',  dot: 'bg-green-400',  label: 'Normal Sinus Rhythm',   severity: 'Normal'   },
  HYP:  { bg: 'bg-yellow-950', border: 'border-yellow-700', text: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Hypertrophy',            severity: 'Mild'     },
  CD:   { bg: 'bg-orange-950', border: 'border-orange-700', text: 'text-orange-400', dot: 'bg-orange-400', label: 'Conduction Disorder',    severity: 'Moderate' },
  STTC: { bg: 'bg-rose-950',   border: 'border-rose-700',   text: 'text-rose-400',   dot: 'bg-rose-500',   label: 'ST/T Change',            severity: 'High'     },
  MI:   { bg: 'bg-red-950',    border: 'border-red-700',    text: 'text-red-400',    dot: 'bg-red-500',    label: 'Myocardial Infarction',  severity: 'Critical' },
}

function PredictionBadge({ prediction, confidence }) {
  if (!prediction) return null
  const s = PREDICTION_STYLES[prediction] ?? PREDICTION_STYLES.NORM
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${s.bg} ${s.border}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${prediction === 'NORM' ? s.dot : `${s.dot} animate-pulse`}`} />
        <div>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold ${s.text}`}>{s.label}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${s.border} ${s.text} font-mono`}>{prediction}</span>
          </div>
          <p className={`text-xs mt-0.5 ${s.text} opacity-60`}>Severity: {s.severity}</p>
        </div>
      </div>
      {confidence != null && (
        <span className={`text-xs font-mono font-bold shrink-0 ${s.text}`}>{confidence}% conf.</span>
      )}
    </div>
  )
}

function PatientRow({ patient, selected, localState, onClick, D }) {
  const conn      = localState?.connectionStatus ?? patient.connection_status ?? 'disconnected'
  const hr        = conn !== 'disconnected' ? (localState?.heartRate ?? patient.current_hr) : null
  const hasAlert  = localState?.anomaly || (patient.recent_anomalies?.length > 0)
  const isPending = patient.status === 'pending'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        selected
          ? isPending ? 'border-yellow-700 bg-yellow-950' : 'border-teal-700 bg-teal-950'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg border overflow-hidden shrink-0 ${
          isPending ? 'bg-yellow-900 border-yellow-800' : 'bg-teal-900 border-teal-800'
        }`}>
          {!isPending && patient.photo_url ? (
            <img src={patient.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className={`text-xs font-bold ${isPending ? 'text-yellow-300' : 'text-teal-300'}`}>
                {isPending ? '?' : initials(patient.name)}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-gray-200 text-sm font-medium truncate">
              {isPending ? (patient.device_id ?? D.unknownDevice) : patient.name}
            </p>
            {hasAlert && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ConnDot status={conn} />
            {isPending
              ? <span className="text-yellow-600 text-xs">{D.unregisteredDevice}</span>
              : <p className="text-gray-500 text-xs truncate">{patient.primary_diagnosis ?? '—'}</p>
            }
          </div>
        </div>
        {hr !== null && (
          <div className="text-right shrink-0">
            <p className="text-white text-sm font-bold font-mono">{hr}</p>
            <p className="text-gray-600 text-xs">bpm</p>
          </div>
        )}
        {hr === null && <p className="text-gray-700 text-xs shrink-0">{D.offline}</p>}
      </div>
    </button>
  )
}

function VitalCard({ label, value, unit, danger }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-center ${
      danger ? 'border-red-800 bg-red-950' : 'border-gray-800 bg-gray-900'
    }`}>
      <p className={`text-2xl font-bold font-mono ${danger ? 'text-red-400' : 'text-white'}`}>
        {value ?? '—'}
      </p>
      <p className="text-gray-500 text-xs mt-0.5">
        {label} <span className="text-gray-600">{unit}</span>
      </p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { T } = useLanguage()
  const D = T.dashboard

  const [email,     setEmail]     = useState('')
  const [patients,  setPatients]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  /**
   * Per-patient LOCAL simulation state (never written to DB).
   * Shape: { heartRate, rrInterval, spo2, mode, anomaly, confidence, connectionStatus, alerts }
   *
   * When real hardware is connected, the DB row updates via Supabase Realtime
   * and overrides `patient.current_hr` etc — the local state is only used
   * during the "simulated" demo mode.
   */
  const [localStates, setLocalStates] = useState({})
  const localRef = useRef(localStates)
  localRef.current = localStates

  // Tracks timestamp of last Realtime UPDATE received per patient
  const lastSeenRef = useRef({})


  // ── Simulation tick — updates every 1 s, never writes to DB ─────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setLocalStates(prev => {
        const next = {}
        for (const [pid, s] of Object.entries(prev)) {
          // Skip disconnected or real hardware — hardware pushes its own values via Realtime
          if (s.connectionStatus === 'disconnected' || s.connectionStatus === 'connected') {
            next[pid] = s; continue
          }
          const hr   = Math.min(110, Math.max(50, s.heartRate + Math.floor(Math.random() * 5) - 2))
          const spo2 = Math.min(100, Math.max(93,
            s.spo2 + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0)
          ))
          next[pid] = { ...s, heartRate: hr, rrInterval: Math.round(60000 / hr), spo2 }
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Stale connection detector — runs every 5 s ────────────────────────────
  // If no Realtime UPDATE received for a connected patient in >15 s → disconnected
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setPatients(prev => {
        const stale = prev.filter(p => {
          if (p.connection_status !== 'connected') return false
          const lastSeen = lastSeenRef.current[p.id]
          if (!lastSeen) return false           // never seen via Realtime this session
          return (now - lastSeen) > 15000       // no update in 15 s
        })
        if (stale.length === 0) return prev
        stale.forEach(p => {
          supabase.from('patients')
            .update({ connection_status: 'disconnected' })
            .eq('id', p.id)
          // Also update localStates so connStatus badge/ECG flip immediately
          patchLocal(p.id, { connectionStatus: 'disconnected' })
        })
        return prev.map(p =>
          stale.find(s => s.id === p.id)
            ? { ...p, connection_status: 'disconnected' }
            : p
        )
      })
    }, 5000)
    return () => clearInterval(id)
  }, [])

  /**
   * In-memory vitals history — ring buffer, max 60 points (~30 min at 30 s).
   * Used for the chart when a patient is in simulated mode so we never write
   * fake data to the database. Shape: { [patientId]: Point[] }
   * Point = { time: 'HH:MM:SS', heartRate, spo2, rrInterval }
   */
  const [localHistory, setLocalHistory] = useState({})
  const MAX_HIST = 60

  // ── Snapshot every 30 s ───────────────────────────────────────────────────
  // • Simulated patients → in-memory ring buffer only (no DB writes)
  // • Connected patients → DB write (real clinical data worth keeping)
  //   In production a real device writes this row directly via the SDK,
  //   so this branch only fires if the browser also has the patient open.
  useEffect(() => {
    const id = setInterval(async () => {
      const states  = localRef.current
      const timeStr = new Date().toTimeString().slice(0, 8) // HH:MM:SS

      // 1. Update in-memory ring buffer for simulated + connected
      setLocalHistory(prev => {
        const next = { ...prev }
        for (const [pid, s] of Object.entries(states)) {
          if (s.connectionStatus === 'disconnected') continue
          const point = { time: timeStr, heartRate: s.heartRate, spo2: s.spo2, rrInterval: s.rrInterval }
          const existing = prev[pid] ?? []
          next[pid] = [...existing, point].slice(-MAX_HIST)
        }
        return next
      })

      // 2. Persist to DB only for genuinely connected (real) devices
      const dbRows = Object.entries(states)
        .filter(([, s]) => s.connectionStatus === 'connected')
        .map(([pid, s]) => ({
          patient_id:  pid,
          heart_rate:  s.heartRate,
          spo2:        s.spo2,
          rr_interval: s.rrInterval,
          source:      'connected',
        }))
      if (dbRows.length > 0) {
        await supabase.from('vitals_history').insert(dbRows)
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Initialise local state for a patient ──────────────────────────────────
  function initLocal(patient) {
    if (localRef.current[patient.id]) return
    setLocalStates(prev => ({
      ...prev,
      [patient.id]: {
        heartRate:        patient.current_hr    ?? 72,
        rrInterval:       patient.current_rr    ?? 833,
        spo2:             patient.current_spo2  ?? 98,
        mode:             'normal',
        anomaly:          null,
        confidence:       null,
        connectionStatus: patient.connection_status === 'connected' ? 'connected' : (patient.connection_status ?? 'simulated'),
        alerts:           [{ message: D.systemStarted, level: 'info', time: nowTime() }],
      },
    }))
  }

  function patchLocal(id, patch) {
    setLocalStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function addAlert(id, message, level) {
    setLocalStates(prev => {
      const s = prev[id]
      if (!s) return prev
      return {
        ...prev,
        [id]: { ...s, alerts: [{ message, level, time: nowTime() }, ...s.alerts].slice(0, 10) },
      }
    })
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  const fetchPatients = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('patients')
      .select(`
        id, name, photo_url, primary_diagnosis, ward, room, bed,
        device_id, connection_status,
        current_hr, current_spo2, current_rr,
        current_prediction, current_confidence,
        ecg_buffer, last_reading,
        recent_anomalies, status
      `)
      // admitted   → normal monitored patients
      // pending    → device powered on but no patient registered yet
      // connected  → device connected regardless of status (safety net)
      .or('status.eq.admitted,status.eq.pending,connection_status.eq.connected')
      .order('name')
    const rows = data ?? []

    // On load, immediately reset any 'connected' patients to 'disconnected'.
    // The ESP32 will set itself back to 'connected' on its next PATCH (~2-10s).
    // This prevents stale 'connected' state from persisting across page refreshes.
    const staleConnected = rows.filter(p => p.connection_status === 'connected')
    if (staleConnected.length > 0) {
      await supabase
        .from('patients')
        .update({ connection_status: 'disconnected' })
        .in('id', staleConnected.map(p => p.id))
    }

    const normalized = rows.map(p =>
      p.connection_status === 'connected' ? { ...p, connection_status: 'disconnected' } : p
    )
    setPatients(normalized)
    setLoading(false)
    if (rows.length > 0) setSelectedId(prev => prev ?? rows[0].id)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
    fetchPatients()
    requestPermission()
  }, [fetchPatients])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  // INSERT  → patient added (via People page or hardware auto-registration)
  // UPDATE  → device connected / vitals changed / status changed
  // This is the only thing your hardware needs to trigger to appear here.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      // New patient added anywhere → show up immediately without refresh
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patients' },
        ({ new: row }) => {
          if (row.status === 'admitted' || row.connection_status === 'connected') {
            setPatients(prev => {
              if (prev.find(p => p.id === row.id)) return prev
              const next = [...prev, row].sort((a, b) => a.name.localeCompare(b.name))
              setSelectedId(id => id ?? row.id)
              return next
            })
          }
        }
      )
      // Device update → vitals change, connection_status change, discharge, etc.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients' },
        ({ new: row }) => {
          const shouldShow =
            row.status === 'admitted' ||
            row.status === 'pending'  ||
            row.connection_status === 'connected'  ||
            row.connection_status === 'simulated'  ||
            row.connection_status === 'reconnecting'

          // Stamp the last time we heard from this patient via Realtime
          if (row.connection_status === 'connected') {
            lastSeenRef.current[row.id] = Date.now()
          }

          setPatients(prev => {
            const exists = prev.find(p => p.id === row.id)
            if (!exists && shouldShow) {
              const next = [...prev, row].sort((a, b) => a.name.localeCompare(b.name))
              setSelectedId(id => id ?? row.id)
              return next
            }
            if (exists && !shouldShow) {
              return prev.filter(p => p.id !== row.id)
            }
            return prev.map(p => (p.id === row.id ? { ...p, ...row } : p))
          })

          // When hardware connects live, sync local vitals to real values
          if (row.connection_status === 'connected') {
            patchLocal(row.id, {
              connectionStatus: 'connected',
              heartRate:  row.current_hr   ?? 72,
              rrInterval: row.current_rr   ?? 833,
              spo2:       row.current_spo2 ?? 98,
            })
          }

        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Init local state when selection changes
  useEffect(() => {
    const p = patients.find(p => p.id === selectedId)
    if (p) initLocal(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, patients])

  // ── Simulation triggers ───────────────────────────────────────────────────
  const selected = patients.find(p => p.id === selectedId)
  const local    = selectedId ? localStates[selectedId] : null

  async function pushAnomaly(type, confidence) {
    const existing = selected?.recent_anomalies ?? []
    const entry = { type, confidence, timestamp: new Date().toISOString() }
    await supabase
      .from('patients')
      .update({ recent_anomalies: [...existing, entry] })
      .eq('id', selectedId)
    // Refresh local patients list so the alert dot updates
    fetchPatients()
  }

  async function clearAnomalies() {
    await supabase
      .from('patients')
      .update({ recent_anomalies: [] })
      .eq('id', selectedId)
    fetchPatients()
  }

  // ── Connection status style helpers ──────────────────────────────────────
  const connStatus = local?.connectionStatus ?? selected?.connection_status ?? 'disconnected'
  const connLabel  = { simulated: T.connectionBar.simulated, connected: T.connectionBar.connected, disconnected: T.connectionBar.disconnected, reconnecting: T.connectionBar.reconnecting }[connStatus]
  const connStyle  = { simulated: 'border-teal-800 bg-teal-950 text-teal-400', connected: 'border-green-800 bg-green-950 text-green-400', disconnected: 'border-gray-800 bg-gray-900 text-gray-500', reconnecting: 'border-yellow-800 bg-yellow-950 text-yellow-400' }[connStatus]

  const connectedCount  = patients.filter(p => p.connection_status === 'connected').length
  const simulatedCount  = patients.filter(p => p.connection_status === 'simulated').length
  const alertCount      = patients.filter(p => (p.recent_anomalies?.length ?? 0) > 0).length
  const pendingCount    = patients.filter(p => p.status === 'pending').length
  const isPendingSelected = selected?.status === 'pending'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar email={email} activeAlerts={alertCount} />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 flex flex-col gap-4 flex-1">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: D.monitoredPatients, value: patients.length,  color: 'text-white' },
            { label: D.connected,         value: connectedCount,   color: 'text-green-400' },
            { label: D.simulated,         value: simulatedCount,   color: 'text-teal-400' },
            { label: D.activeAlerts,      value: alertCount,       color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-gray-500 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-sm">{T.people.loading}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1">

            {/* ── Left: patient list ── */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-white font-semibold text-sm">{D.monitoredPatients}</p>
                <div className="flex items-center gap-2">
                  {pendingCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-950 border border-yellow-800 text-yellow-400">
                      {pendingCount} {D.unregistered}
                    </span>
                  )}
                  <span className="text-gray-600 text-xs">{patients.length} {D.total}</span>
                </div>
              </div>

              <div className="space-y-2 overflow-y-auto max-h-[72vh] pr-1">
                {patients.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center">
                    <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-3">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                      </svg>
                    </div>
                    <p className="text-gray-500 text-sm font-medium">{D.waitingTitle}</p>
                    <p className="text-gray-700 text-xs mt-1 leading-relaxed max-w-xs mx-auto">
                      {D.waitingSubtitle}
                    </p>
                  </div>
                ) : (
                  patients.map(p => (
                    <PatientRow
                      key={p.id}
                      patient={p}
                      selected={selectedId === p.id}
                      localState={localStates[p.id]}
                      onClick={() => { setSelectedId(p.id); initLocal(p) }}
                      D={D}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── Right: monitoring panel ── */}
            <div className="lg:col-span-3 flex flex-col gap-4">

              {!selected ? (
                <div className="flex-1 flex items-center justify-center bg-gray-900 border border-gray-800 rounded-xl">
                  <p className="text-gray-600 text-sm">{D.selectPatient}</p>
                </div>
              ) : (
                <>
                  {/* Patient header + connection status */}
                  <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 border ${
                    isPendingSelected ? 'bg-yellow-950 border-yellow-800' : 'bg-gray-900 border-gray-800'
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl border overflow-hidden shrink-0 ${
                        isPendingSelected ? 'bg-yellow-900 border-yellow-700' : 'bg-teal-900 border-teal-800'
                      }`}>
                        {!isPendingSelected && selected.photo_url ? (
                          <img src={selected.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className={`text-sm font-bold ${isPendingSelected ? 'text-yellow-300' : 'text-teal-300'}`}>
                              {isPendingSelected ? '?' : initials(selected.name)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm truncate">
                          {isPendingSelected ? (selected.device_id ?? 'Unknown Device') : selected.name}
                        </p>
                        <p className="text-gray-500 text-xs truncate">
                          {isPendingSelected
                            ? D.pendingNote
                            : `${selected.primary_diagnosis ?? '—'}${selected.ward ? ` · ${selected.ward} / ${selected.room}` : ''}${selected.device_id ? ` · ${selected.device_id}` : ''}`
                          }
                        </p>
                      </div>
                    </div>
                    <div className={`text-xs px-3 py-1.5 rounded-lg border shrink-0 ${connStyle}`}>
                      {connLabel}
                    </div>
                  </div>

                  {/* Unregistered device banner */}
                  {isPendingSelected && (
                    <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <p className="text-yellow-300 text-sm">
                          {D.pendingWarningPrefix} <span className="font-mono font-bold">{selected.device_id}</span> {D.pendingWarningSuffix}
                        </p>
                      </div>
                      <a
                        href="/people"
                        className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium shrink-0"
                      >
                        {D.registerPatient}
                      </a>
                    </div>
                  )}

                  {/* Real-time classification — only shown when ESP32 is connected */}
                  {connStatus === 'connected' && selected.current_prediction && (
                    <PredictionBadge prediction={selected.current_prediction} confidence={selected.current_confidence} />
                  )}

                  {/* Vitals — only shown when connected */}
                  <div className="grid grid-cols-3 gap-3">
                    <VitalCard label={T.statCards.heartRate}  value={connStatus === 'connected' ? selected.current_hr   : null} unit="bpm" danger={selected.current_hr  < 50 || selected.current_hr  > 100} />
                    <VitalCard label={T.statCards.spo2}       value={connStatus === 'connected' ? selected.current_spo2 : null} unit="%"   danger={selected.current_spo2 < 95} />
                    <VitalCard label={T.statCards.rrInterval} value={connStatus === 'connected' ? selected.current_rr   : null} unit="ms"  danger={false} />
                  </div>

                  {/* ECG waveform — only shown when ESP32 is connected */}
                  {connStatus === 'connected' ? (
                    <ECGChart
                      mode={local?.mode ?? 'normal'}
                      samples={selected.ecg_buffer ?? null}
                      prediction={selected.current_prediction ?? null}
                    />
                  ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-white">Live ECG — Lead I</span>
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-800 border-gray-700 text-gray-500">No signal</span>
                      </div>
                      <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">
                        Device disconnected — waiting for ESP32
                      </div>
                    </div>
                  )}

                  {/* Live session vitals trend */}
                  {!isPendingSelected && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4">
                      <VitalsChart
                        patientId={selected.id}
                        localData={localHistory[selected.id]}
                      />
                    </div>
                  )}

                  {/* Alert log */}
                  <AlertLog alerts={local?.alerts ?? []} />
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>

  )
}
