import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import Navbar from '../components/Navbar'

function confStyle(conf) {
  const n = Number(conf)
  if (n >= 90) return 'text-red-400 bg-red-950 border-red-800'
  if (n >= 80) return 'text-orange-400 bg-orange-950 border-orange-800'
  if (n >= 70) return 'text-yellow-400 bg-yellow-950 border-yellow-800'
  return 'text-gray-400 bg-gray-800 border-gray-700'
}

function confDot(conf) {
  const n = Number(conf)
  if (n >= 90) return 'bg-red-500'
  if (n >= 80) return 'bg-orange-400'
  if (n >= 70) return 'bg-yellow-400'
  return 'bg-gray-500'
}

function formatTimestamp(ts) {
  if (!ts) return null
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function Alerts() {
  const { T } = useLanguage()
  const A = T.alerts
  const P = T.people
  const [email, setEmail]           = useState('')
  const [patients, setPatients]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterPatientId, setFilterPatientId] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? '')
    })
    supabase
      .from('patients')
      .select('id, name, status, recent_anomalies')
      .order('name')
      .then(({ data }) => {
        setPatients(data ?? [])
        setLoading(false)
      })
  }, [])

  // Flatten anomalies from all patients
  const allAnomalies = patients.flatMap(p =>
    (p.recent_anomalies ?? []).map(a => ({
      ...a,
      patientId:   p.id,
      patientName: p.name,
      patientStatus: p.status,
    }))
  )

  const filtered = filterPatientId === 'all'
    ? allAnomalies
    : allAnomalies.filter(a => a.patientId === filterPatientId)

  // Most recent first
  const sorted = [...filtered].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0
    if (!a.timestamp) return 1
    if (!b.timestamp) return -1
    return new Date(b.timestamp) - new Date(a.timestamp)
  })

  const totalAnomalies   = allAnomalies.length
  const highConfidence   = allAnomalies.filter(a => Number(a.confidence) >= 80).length
  const patientsAffected = new Set(allAnomalies.map(a => a.patientId)).size

  // Patients that actually have anomalies (for the filter dropdown)
  const patientsWithAlerts = patients.filter(p => (p.recent_anomalies ?? []).length > 0)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar email={email} />

      <div className="max-w-4xl mx-auto w-full px-4 py-6 flex flex-col gap-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-white font-semibold text-xl">{A.title}</h1>
            {totalAnomalies > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-red-800 bg-red-950 text-red-400">
                {totalAnomalies}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm">{A.subtitle}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: A.totalAnomalies,   value: totalAnomalies,   color: 'text-white' },
            { label: A.highConfidence,   value: highConfidence,   color: 'text-red-400' },
            { label: A.patientsAffected, value: patientsAffected, color: 'text-teal-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-gray-500 text-xs mt-0.5 leading-snug">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs shrink-0">{A.filterByPatient}</span>
          <select
            value={filterPatientId}
            onChange={e => setFilterPatientId(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none focus:border-gray-600 transition-colors"
          >
            <option value="all">{A.allPatients}</option>
            {patientsWithAlerts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Alert feed */}
        {loading ? (
          <p className="text-gray-500 text-sm">{P.loading}</p>
        ) : sorted.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-6 py-16 text-center">
            <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <p className="text-gray-600 text-sm">
              {filterPatientId === 'all' ? A.noAlerts : A.noAlertsFiltered}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((a, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${confDot(a.confidence)}`} />
                  <div className="min-w-0">
                    <p className="text-gray-200 text-sm font-medium truncate">{a.type}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-indigo-400 text-xs font-medium">{a.patientName}</span>
                      {a.timestamp && (
                        <>
                          <span className="text-gray-700 text-xs">·</span>
                          <span className="text-gray-500 text-xs font-mono">{formatTimestamp(a.timestamp)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-lg border shrink-0 ${confStyle(a.confidence)}`}>
                  {a.confidence}{P.confSuffix}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Alerts
