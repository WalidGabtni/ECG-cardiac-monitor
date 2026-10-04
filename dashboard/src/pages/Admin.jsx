import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import Navbar from '../components/Navbar'

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-gray-500 text-xs mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function Avatar({ name, color = 'bg-indigo-900 text-indigo-300' }) {
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-gray-700 ${color}`}>
      <span className="text-sm font-bold">{initials(name)}</span>
    </div>
  )
}

function Badge({ label, variant }) {
  const styles = {
    pending:   'bg-yellow-950 text-yellow-400 border-yellow-800',
    active:    'bg-green-950 text-green-400 border-green-800',
    rejected:  'bg-red-950 text-red-400 border-red-800',
    'on-duty': 'bg-green-950 text-green-400 border-green-800',
    'off-duty':'bg-gray-800 text-gray-400 border-gray-700',
    admitted:  'bg-teal-950 text-teal-400 border-teal-800',
    outpatient:'bg-yellow-950 text-yellow-400 border-yellow-800',
    discharged:'bg-gray-800 text-gray-400 border-gray-700',
    patient:   'bg-teal-950 text-teal-400 border-teal-800',
    admin:     'bg-purple-950 text-purple-400 border-purple-800',
    doctor:    'bg-indigo-950 text-indigo-400 border-indigo-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles[variant] ?? styles['off-duty']}`}>
      {label}
    </span>
  )
}

// ── Pending tab ────────────────────────────────────────────────────────────────

function PendingTab({ A, onApprove, onReject }) {
  const [list, setList]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('doctors')
      .select('id, name, email, specialty, hospital, license, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setList(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function approve(doc) {
    setBusy(doc.id + '_approve')
    await onApprove(doc)
    fetch()
    setBusy(null)
  }

  async function reject(doc) {
    setBusy(doc.id + '_reject')
    await onReject(doc)
    fetch()
    setBusy(null)
  }

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">{A.loading}</p>

  if (list.length === 0) return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-2xl bg-green-950 border border-green-800 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p className="text-white font-medium">{A.noPending}</p>
      <p className="text-gray-500 text-sm mt-1">{A.noPendingSub}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {list.map(doc => (
        <div key={doc.id} className="bg-gray-900 border border-yellow-900 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-4">
            <Avatar name={doc.name} color="bg-yellow-950 text-yellow-300" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-semibold">{doc.name}</p>
                <Badge label={A.pendingBadge} variant="pending" />
              </div>
              <p className="text-gray-400 text-sm mt-0.5">{doc.specialty}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <span className="text-gray-500 text-xs flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {doc.email}
                </span>
                {doc.license && (
                  <span className="text-gray-500 text-xs flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                    {doc.license}
                  </span>
                )}
                {doc.hospital && (
                  <span className="text-gray-500 text-xs flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    {doc.hospital}
                  </span>
                )}
                <span className="text-gray-600 text-xs">{A.registered} {timeAgo(doc.created_at)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => approve(doc)}
                disabled={!!busy}
                className="text-xs bg-green-900 hover:bg-green-800 disabled:opacity-50 text-green-400 border border-green-700 px-4 py-2 rounded-xl transition-colors font-medium flex items-center gap-2"
              >
                {busy === doc.id + '_approve' ? (
                  <span className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin"/>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
                {A.approve}
              </button>
              <button
                onClick={() => reject(doc)}
                disabled={!!busy}
                className="text-xs bg-red-950 hover:bg-red-900 disabled:opacity-50 text-red-400 border border-red-800 px-4 py-2 rounded-xl transition-colors font-medium flex items-center gap-2"
              >
                {busy === doc.id + '_reject' ? (
                  <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin"/>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                )}
                {A.reject}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Staff tab ──────────────────────────────────────────────────────────────────

function StaffTab({ A }) {
  const [list, setList]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(null)
  const [query, setQuery]   = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('doctors')
      .select('id, name, email, specialty, hospital, department, status, created_at')
      .neq('status', 'pending')
      .order('name')
    setList(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function toggleDuty(doc) {
    setBusy(doc.id)
    const next = doc.status === 'on-duty' ? 'off-duty' : 'on-duty'
    await supabase.from('doctors').update({ status: next }).eq('id', doc.id)
    fetch()
    setBusy(null)
  }

  async function removeStaff(doc) {
    if (!confirm(`Remove Dr. ${doc.name}? This cannot be undone.`)) return
    setBusy(doc.id)
    await supabase.from('doctors').delete().eq('id', doc.id)
    fetch()
    setBusy(null)
  }

  const filtered = list.filter(d =>
    d.name.toLowerCase().includes(query.toLowerCase()) ||
    (d.specialty ?? '').toLowerCase().includes(query.toLowerCase()) ||
    (d.email ?? '').toLowerCase().includes(query.toLowerCase())
  )

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">{A.loading}</p>

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={A.searchStaff}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-gray-600 transition-colors"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-600 text-sm italic py-6 text-center">{A.noStaff}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <div key={doc.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-3.5 flex items-center gap-4">
              <Avatar name={doc.name} color="bg-indigo-950 text-indigo-300" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-gray-200 font-medium text-sm">{doc.name}</p>
                  <Badge label={doc.status} variant={doc.status} />
                </div>
                <p className="text-gray-500 text-xs mt-0.5 truncate">
                  {doc.specialty}{doc.hospital ? ` · ${doc.hospital}` : ''}
                </p>
                <p className="text-gray-600 text-xs mt-0.5 font-mono">{doc.email}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => toggleDuty(doc)}
                  disabled={busy === doc.id}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium disabled:opacity-50 ${
                    doc.status === 'on-duty'
                      ? 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
                      : 'bg-green-950 hover:bg-green-900 text-green-400 border-green-800'
                  }`}
                >
                  {doc.status === 'on-duty' ? A.setOffDuty : A.setOnDuty}
                </button>
                <button
                  onClick={() => removeStaff(doc)}
                  disabled={busy === doc.id}
                  className="text-xs px-3 py-1.5 rounded-lg border bg-red-950 hover:bg-red-900 text-red-400 border-red-800 transition-colors font-medium disabled:opacity-50"
                >
                  {A.remove}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Patients tab ───────────────────────────────────────────────────────────────

function PatientsTab({ A }) {
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(null)
  const [query, setQuery]     = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('patients')
      .select('id, name, email, primary_diagnosis, status, dob, created_at')
      .order('created_at', { ascending: false })
    setList(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function removePatient(patient) {
    if (!confirm(`Remove ${patient.name}? This will delete all their records.`)) return
    setBusy(patient.id)
    await supabase.from('patients').delete().eq('id', patient.id)
    fetch()
    setBusy(null)
  }

  const filtered = list.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.email ?? '').toLowerCase().includes(query.toLowerCase()) ||
    (p.primary_diagnosis ?? '').toLowerCase().includes(query.toLowerCase())
  )

  const statusColor = { admitted: 'teal', outpatient: 'yellow', discharged: 'gray' }

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">{A.loading}</p>

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={A.searchPatients}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-gray-600 transition-colors"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-600 text-sm italic py-6 text-center">{A.noPatients}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-3.5 flex items-center gap-4">
              <Avatar name={p.name} color="bg-teal-950 text-teal-300" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-gray-200 font-medium text-sm">{p.name}</p>
                  <Badge label={p.status} variant={p.status} />
                </div>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{p.primary_diagnosis ?? '—'}</p>
                <p className="text-gray-600 text-xs mt-0.5 font-mono">{p.email ?? '—'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className="text-gray-600 text-xs self-center hidden sm:block">{timeAgo(p.created_at)}</span>
                <button
                  onClick={() => removePatient(p)}
                  disabled={busy === p.id}
                  className="text-xs px-3 py-1.5 rounded-lg border bg-red-950 hover:bg-red-900 text-red-400 border-red-800 transition-colors font-medium disabled:opacity-50"
                >
                  {A.remove}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── System tab ─────────────────────────────────────────────────────────────────

function SystemTab({ A, stats }) {
  const rows = [
    { label: A.sysVersion,  value: '1.0.0' },
    { label: A.sysStack,    value: 'React 19 · Vite · Tailwind v4 · Supabase' },
    { label: A.sysDb,       value: 'PostgreSQL (Supabase)' },
    { label: A.sysRealtime, value: A.sysRealtimeVal },
    { label: A.sysMap,      value: 'Leaflet + OpenStreetMap' },
    { label: A.sysHospital, value: 'Menzel Bourguiba Regional Hospital' },
  ]

  return (
    <div className="space-y-6">

      {/* Quick counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: A.totalDoctors,  value: stats.doctors,  color: 'text-indigo-400' },
          { label: A.totalPatients, value: stats.patients, color: 'text-teal-400' },
          { label: A.totalAlerts,   value: stats.alerts,   color: 'text-red-400' },
          { label: A.pendingCount,  value: stats.pending,  color: 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
            <p className="text-gray-500 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* System info table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{A.systemInfo}</p>
        </div>
        {rows.map(({ label, value }, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
            <span className="text-gray-500 text-xs shrink-0">{label}</span>
            <span className="text-gray-300 text-xs text-right font-mono">{value}</span>
          </div>
        ))}
      </div>

      {/* Required SQL reminder */}
      <div className="bg-yellow-950 border border-yellow-800 rounded-2xl px-5 py-4">
        <p className="text-xs font-semibold text-yellow-400 uppercase tracking-widest mb-2">{A.sqlRequired}</p>
        <p className="text-yellow-600 text-xs mb-3">{A.sqlNote}</p>
        <pre className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto font-mono whitespace-pre leading-relaxed">
{`create or replace function approve_pending_doctor(p_email text)
returns void language plpgsql security definer as $$
begin
  update profiles p set status = 'active'
    from auth.users u where u.id = p.id and u.email = p_email;
  update doctors set status = 'on-duty' where email = p_email;
end; $$;

create or replace function reject_pending_doctor(p_email text)
returns void language plpgsql security definer as $$
begin
  update profiles p set status = 'rejected'
    from auth.users u where u.id = p.id and u.email = p_email;
  delete from doctors where email = p_email;
end; $$;`}
        </pre>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS = ['pending', 'staff', 'patients', 'system']

function Admin() {
  const { T } = useLanguage()
  const A = T.admin

  const [email, setEmail]   = useState('')
  const [tab,   setTab]     = useState('pending')
  const [stats, setStats]   = useState({ doctors: 0, patients: 0, alerts: 0, pending: 0 })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? '')
    })
    fetchStats()
  }, [])

  async function fetchStats() {
    const [
      { count: doctors },
      { count: patients },
      { count: pending },
      { data: alertData },
    ] = await Promise.all([
      supabase.from('doctors').select('id', { count: 'exact', head: true }).neq('status', 'pending'),
      supabase.from('patients').select('id', { count: 'exact', head: true }),
      supabase.from('doctors').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('patients').select('recent_anomalies').neq('recent_anomalies', '[]'),
    ])
    const alerts = (alertData ?? []).filter(p => Array.isArray(p.recent_anomalies) && p.recent_anomalies.length > 0).length
    setStats({ doctors: doctors ?? 0, patients: patients ?? 0, pending: pending ?? 0, alerts })
  }

  async function handleApprove(doc) {
    await supabase.rpc('approve_pending_doctor', { p_email: doc.email })
    fetchStats()
  }

  async function handleReject(doc) {
    await supabase.rpc('reject_pending_doctor', { p_email: doc.email })
    fetchStats()
  }

  const tabConfig = [
    { key: 'pending',  label: A.tabPending,  badge: stats.pending > 0 ? stats.pending : null },
    { key: 'staff',    label: A.tabStaff,    badge: null },
    { key: 'patients', label: A.tabPatients, badge: null },
    { key: 'system',   label: A.tabSystem,   badge: null },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar email={email} />

      <div className="max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-900 border border-purple-700 flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-2xl">{A.title}</h1>
            <p className="text-gray-500 text-sm mt-1">{A.subtitle}</p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={A.statPending}
            value={stats.pending}
            color={stats.pending > 0 ? 'bg-yellow-950 border border-yellow-800' : 'bg-gray-800'}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stats.pending > 0 ? '#facc15' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
          />
          <StatCard
            label={A.statDoctors}
            value={stats.doctors}
            color="bg-indigo-950 border border-indigo-800"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          />
          <StatCard
            label={A.statPatients}
            value={stats.patients}
            color="bg-teal-950 border border-teal-800"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
          />
          <StatCard
            label={A.statAlerts}
            value={stats.alerts}
            color={stats.alerts > 0 ? 'bg-red-950 border border-red-800' : 'bg-gray-800'}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stats.alerts > 0 ? '#f87171' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1.5 flex-wrap">
          {tabConfig.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {label}
              {badge && (
                <span className="w-5 h-5 rounded-full bg-yellow-500 text-gray-950 text-[11px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {tab === 'pending'  && <PendingTab  A={A} onApprove={handleApprove} onReject={handleReject} />}
          {tab === 'staff'    && <StaffTab    A={A} />}
          {tab === 'patients' && <PatientsTab A={A} />}
          {tab === 'system'   && <SystemTab   A={A} stats={stats} />}
        </div>

      </div>
    </div>
  )
}

export default Admin
