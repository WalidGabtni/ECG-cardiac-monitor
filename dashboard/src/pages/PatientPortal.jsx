import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import VitalsChart from '../components/VitalsChart'

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className="text-gray-200 text-xs text-right">
        {value ?? <span className="text-gray-600 italic">—</span>}
      </span>
    </div>
  )
}

function TagList({ items, color }) {
  if (!items?.length) return <p className="text-gray-600 text-xs italic">—</p>
  const colors = {
    red:    'bg-red-950 border-red-800 text-red-400',
    teal:   'bg-teal-950 border-teal-800 text-teal-400',
    indigo: 'bg-indigo-950 border-indigo-800 text-indigo-400',
    gray:   'bg-gray-800 border-gray-700 text-gray-400',
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span key={i} className={`text-xs px-2.5 py-1 rounded-lg border ${colors[color] ?? colors.gray}`}>
          {typeof item === 'object' ? `${item.name}${item.dose ? ` · ${item.dose}` : ''}` : item}
        </span>
      ))}
    </div>
  )
}

export default function PatientPortal() {
  const { T } = useLanguage()
  const PP = T.portal

  const [patient,  setPatient]  = useState(null)
  const [doctor,   setDoctor]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [email,    setEmail]    = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email)

      // Find patient record by email
      const { data: p } = await supabase
        .from('patients')
        .select('*')
        .eq('email', user.email)
        .single()

      if (p) {
        setPatient(p)
        // Load assigned doctor if any
        if (p.doctor_id) {
          const { data: d } = await supabase
            .from('doctors')
            .select('name, specialty, email, phone, photo_url')
            .eq('id', p.doctor_id)
            .single()
          setDoctor(d)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  function computeAge(dob) {
    if (!dob) return null
    const today = new Date()
    const birth = new Date(dob)
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() - birth.getMonth() < 0 ||
       (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return age
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">{PP.loading}</p>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 text-sm font-medium mb-1">{PP.noRecord}</p>
          <p className="text-gray-600 text-xs">{PP.noRecordSub}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            {PP.signOut}
          </button>
        </div>
      </div>
    )
  }

  const age      = computeAge(patient.dob)
  const anomalies = patient.recent_anomalies ?? []

  return (
    <div className="min-h-screen bg-gray-950">

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <span className="text-white font-medium text-sm">ECG Monitor</span>
          <span className="bg-teal-950 text-teal-400 text-xs px-2 py-0.5 rounded-full border border-teal-800">{PP.portalBadge}</span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {PP.signOut}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Patient header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5 flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl border border-teal-700 overflow-hidden shrink-0">
            {patient.photo_url
              ? <img src={patient.photo_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-teal-900 flex items-center justify-center">
                  <span className="text-teal-300 font-bold text-xl">{initials(patient.name)}</span>
                </div>
            }
          </div>
          <div>
            <h1 className="text-white font-semibold text-xl">{patient.name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {[age ? `${age} ${PP.years}` : null, patient.gender, patient.blood_type].filter(Boolean).join(' · ')}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs px-2.5 py-1 rounded-full border border-teal-800 bg-teal-950 text-teal-400">
                {patient.status}
              </span>
              {patient.ward && (
                <span className="text-xs px-2.5 py-1 rounded-full border border-gray-700 bg-gray-800 text-gray-400">
                  {patient.ward} · {patient.room} · {patient.bed}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Recent alerts */}
        {anomalies.length > 0 && (
          <div className="bg-red-950/40 border border-red-800 rounded-2xl px-6 py-4">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-3">{PP.recentAlerts}</p>
            <div className="space-y-2">
              {anomalies.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-red-300 text-sm">{a.type}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-red-400">{a.confidence}%</span>
                    {a.timestamp && (
                      <span className="text-xs text-gray-600 font-mono">
                        {new Date(a.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vitals history chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5">
          <VitalsChart patientId={patient.id} />
        </div>

        {/* Medical info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Diagnoses */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4">
            <Section title={PP.diagnoses}>
              {patient.primary_diagnosis && (
                <p className="text-gray-200 text-sm font-medium mb-2">{patient.primary_diagnosis}</p>
              )}
              <TagList items={patient.secondary_diagnoses} color="indigo" />
            </Section>
          </div>

          {/* Medications */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4">
            <Section title={PP.medications}>
              <TagList items={patient.medications} color="teal" />
            </Section>
          </div>

          {/* Allergies */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4">
            <Section title={PP.allergies}>
              <TagList items={patient.allergies} color="red" />
            </Section>
          </div>

          {/* Personal info */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4">
            <Section title={PP.personalInfo}>
              <InfoRow label={PP.dob}       value={patient.dob} />
              <InfoRow label={PP.bloodType} value={patient.blood_type} />
              <InfoRow label={PP.height}    value={patient.height ? `${patient.height} cm` : null} />
              <InfoRow label={PP.weight}    value={patient.weight ? `${patient.weight} kg` : null} />
            </Section>
          </div>
        </div>

        {/* Assigned doctor */}
        {doctor && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">{PP.myDoctor}</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl border border-indigo-700 overflow-hidden shrink-0">
                {doctor.photo_url
                  ? <img src={doctor.photo_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-indigo-900 flex items-center justify-center">
                      <span className="text-indigo-300 font-bold">{initials(doctor.name)}</span>
                    </div>
                }
              </div>
              <div>
                <p className="text-white font-medium">{doctor.name}</p>
                <p className="text-gray-400 text-sm">{doctor.specialty}</p>
                {doctor.email && <p className="text-gray-600 text-xs mt-0.5 font-mono">{doctor.email}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {patient.notes && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{PP.notes}</p>
            <p className="text-gray-300 text-sm leading-relaxed">{patient.notes}</p>
          </div>
        )}

        <p className="text-gray-700 text-xs text-center pb-4">
          {PP.readOnly}
        </p>
      </div>
    </div>
  )
}
