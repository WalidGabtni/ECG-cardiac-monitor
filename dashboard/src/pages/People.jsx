import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import Navbar from '../components/Navbar'
import PatientForm from '../components/PatientForm'
import DoctorForm from '../components/DoctorForm'
import ConfirmModal from '../components/ConfirmModal'
import { printPatient } from '../lib/printPatient'
import VitalsChart from '../components/VitalsChart'

// ── Data mapping ──────────────────────────────────────────────────────────────

function computeAge(dob) {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function mapPatient(row) {
  return {
    id:               row.id,
    name:             row.name,
    age:              computeAge(row.dob),
    gender:           row.gender,
    dob:              row.dob,
    bloodType:        row.blood_type,
    phone:            row.phone,
    email:            row.email,
    address:          row.address,
    emergencyContact: {
      name:     row.emergency_contact_name,
      relation: row.emergency_contact_relation,
      phone:    row.emergency_contact_phone,
    },
    weight:             row.weight,
    height:             row.height,
    status:             row.status,
    admissionDate:      row.admission_date,
    dischargeDate:      row.discharge_date,
    ward:               row.ward,
    room:               row.room,
    bed:                row.bed,
    insurance: {
      provider:     row.insurance_provider,
      policyNumber: row.insurance_policy_number,
      expiry:       row.insurance_expiry,
    },
    doctorId:           row.doctor_id,
    primaryDiagnosis:   row.primary_diagnosis,
    secondaryDiagnoses: row.secondary_diagnoses  ?? [],
    allergies:          row.allergies             ?? [],
    medications:        row.medications           ?? [],
    medicalHistory:     row.medical_history       ?? [],
    deviceId:           row.device_id,
    connectionStatus:   row.connection_status     ?? 'disconnected',
    lastReading:        row.last_reading,
    currentHR:          row.current_hr,
    currentSpo2:        row.current_spo2,
    currentRR:          row.current_rr,
    recentAnomalies:    row.recent_anomalies      ?? [],
    notes:              row.notes,
    photoUrl:           row.photo_url             ?? null,
  }
}

function mapDoctor(row, patients) {
  return {
    id:             row.id,
    name:           row.name,
    specialty:      row.specialty,
    license:        row.license,
    email:          row.email,
    phone:          row.phone,
    department:     row.department,
    hospital:       row.hospital,
    qualifications: row.qualifications ?? [],
    experience:     row.experience,
    status:         row.status,
    schedule:       row.schedule,
    bio:            row.bio,
    patientIds:     patients.filter(p => p.doctor_id === row.id).map(p => p.id),
    photoUrl:       row.photo_url ?? null,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bmi(weight, height) {
  if (!weight || !height) return null
  return (weight / Math.pow(height / 100, 2)).toFixed(1)
}

function bmiCategory(b) {
  if (!b) return null
  if (b < 18.5) return 'Underweight'
  if (b < 25)   return 'Normal'
  if (b < 30)   return 'Overweight'
  return 'Obese'
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ── Badges ────────────────────────────────────────────────────────────────────

function PatientStatusBadge({ status, T }) {
  const map = {
    admitted:   'bg-teal-950 text-teal-400 border-teal-800',
    outpatient: 'bg-yellow-950 text-yellow-400 border-yellow-800',
    discharged: 'bg-gray-800 text-gray-400 border-gray-700',
  }
  const label = {
    admitted:   T.people.statusAdmitted,
    outpatient: T.people.statusOutpatient,
    discharged: T.people.statusDischarged,
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] ?? map.discharged}`}>
      {label[status] ?? status}
    </span>
  )
}

function ConnectionDot({ status }) {
  const map = {
    connected:    'bg-green-400',
    simulated:    'bg-teal-400',
    disconnected: 'bg-gray-600',
    reconnecting: 'bg-yellow-400',
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`w-1.5 h-1.5 rounded-full ${map[status] ?? 'bg-gray-600'}`} />
      {status}
    </span>
  )
}

function DoctorStatusBadge({ status, T }) {
  if (status === 'on-duty')
    return <span className="text-xs px-2 py-0.5 rounded-full border bg-green-950 text-green-400 border-green-800">{T.people.onDutyLabel}</span>
  if (status === 'pending')
    return <span className="text-xs px-2 py-0.5 rounded-full border bg-yellow-950 text-yellow-400 border-yellow-800">{T.people.pendingApproval}</span>
  return <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-800 text-gray-400 border-gray-700">{T.people.offDutyLabel}</span>
}

// ── Section / InfoRow ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className={`text-gray-200 text-xs text-right ${mono ? 'font-mono' : ''}`}>
        {value ?? <span className="text-gray-600 italic">—</span>}
      </span>
    </div>
  )
}

// ── Patient detail panel ──────────────────────────────────────────────────────

function PatientDetail({ patient, doctor, T, onEdit, onDischarge, onDelete, onPrint, userRole }) {
  const P  = T.people
  const SC = T.statCards
  const b = bmi(patient.weight, patient.height)
  const hrDanger   = patient.currentHR   !== null && (patient.currentHR < 50 || patient.currentHR > 100)
  const spo2Danger = patient.currentSpo2 !== null && patient.currentSpo2 < 95

  return (
    <div className="space-y-6 pb-8">

      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl overflow-hidden border border-teal-700 shrink-0">
          {patient.photoUrl ? (
            <img src={patient.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-teal-900 flex items-center justify-center">
              <span className="text-teal-300 font-bold text-lg">{initials(patient.name)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-lg leading-tight">{patient.name}</h2>
          <p className="text-gray-400 text-sm mt-0.5">{patient.primaryDiagnosis ?? '—'}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <PatientStatusBadge status={patient.status} T={T} />
            {patient.ward && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400">
                {patient.ward} · {patient.room} · {P.wardRoomBed.split('/')[2]?.trim() ?? 'Bed'} {patient.bed}
              </span>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={onEdit} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
              ✎ {P.editPatient}
            </button>
            <button onClick={onPrint} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
              ⬇ {P.exportPdf}
            </button>
            {patient.status === 'admitted' && (
              <button onClick={onDischarge} className="text-xs bg-yellow-950 hover:bg-yellow-900 text-yellow-400 border border-yellow-800 px-3 py-1.5 rounded-lg transition-colors">
                {P.discharge}
              </button>
            )}
            {userRole === 'admin' && (
              <button onClick={onDelete} className="text-xs bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 px-3 py-1.5 rounded-lg transition-colors">
                {P.deletePatient}
              </button>
            )}
          </div>
        </div>
      </div>

      {patient.connectionStatus !== 'disconnected' && patient.currentHR !== null && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: SC.heartRate,   value: `${patient.currentHR} bpm`, danger: hrDanger },
            { label: SC.spo2,        value: `${patient.currentSpo2}%`,  danger: spo2Danger },
            { label: SC.rrInterval,  value: `${patient.currentRR} ms`,  danger: false },
          ].map(({ label, value, danger }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${danger ? 'border-red-800 bg-red-950' : 'border-gray-800 bg-gray-900'}`}>
              <p className={`text-lg font-bold ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Vitals history charts ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-4">
        <VitalsChart patientId={patient.id} />
      </div>

      <Section title={P.personalInfo}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-1">
          <InfoRow label={P.dateOfBirth} value={patient.dob} />
          <InfoRow label={P.age}         value={patient.age !== null ? `${patient.age} ${P.years}` : null} />
          <InfoRow label={P.gender}      value={patient.gender} />
          <InfoRow label={P.bloodType}   value={patient.bloodType} />
          <InfoRow label={P.height}      value={patient.height ? `${patient.height} cm` : null} />
          <InfoRow label={P.weight}      value={patient.weight ? `${patient.weight} kg` : null} />
          <InfoRow label={P.bmi}         value={b ? `${b} (${bmiCategory(Number(b))})` : null} />
        </div>
      </Section>

      <Section title={P.contact}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-1">
          <InfoRow label={P.phone}            value={patient.phone} mono />
          <InfoRow label={P.email}            value={patient.email} mono />
          <InfoRow label={P.address}          value={patient.address} />
          <InfoRow label={P.emergencyContact} value={patient.emergencyContact?.name ? `${patient.emergencyContact.name} (${patient.emergencyContact.relation})` : null} />
          <InfoRow label={P.emergencyPhone}   value={patient.emergencyContact?.phone} mono />
        </div>
      </Section>

      <Section title={P.admission}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-1">
          <InfoRow label={P.status}          value={patient.status} />
          <InfoRow label={P.admissionDate}   value={patient.admissionDate} />
          <InfoRow label={P.dischargeDate}   value={patient.dischargeDate} />
          <InfoRow label={P.wardRoomBed}     value={patient.ward ? `${patient.ward} · ${patient.room} · ${patient.bed}` : null} />
          <InfoRow label={P.attendingDoctor} value={doctor?.name} />
        </div>
      </Section>

      <Section title={P.diagnoses}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-2 space-y-2">
          <div className="flex items-start gap-2 py-1.5 border-b border-gray-800">
            <span className="text-gray-500 text-xs shrink-0 mt-0.5">{P.primary}</span>
            <span className="text-teal-400 text-xs font-medium">{patient.primaryDiagnosis ?? '—'}</span>
          </div>
          {patient.secondaryDiagnoses.map((d, i) => (
            <div key={i} className={`flex items-start gap-2 py-1.5 ${i < patient.secondaryDiagnoses.length - 1 ? 'border-b border-gray-800' : ''}`}>
              <span className="text-gray-500 text-xs shrink-0 mt-0.5">{P.secondary}</span>
              <span className="text-gray-300 text-xs">{d}</span>
            </div>
          ))}
          {patient.secondaryDiagnoses.length === 0 && (
            <p className="text-gray-600 text-xs italic py-1">{P.noSecondaryDiagnoses}</p>
          )}
        </div>
      </Section>

      <Section title={P.allergiesSection}>
        <div className="flex flex-wrap gap-2">
          {patient.allergies.length === 0
            ? <span className="text-gray-600 text-xs italic">{P.noAllergies}</span>
            : patient.allergies.map(a => (
                <span key={a} className="text-xs px-2 py-1 rounded-lg border border-red-800 bg-red-950 text-red-400">{a}</span>
              ))
          }
        </div>
      </Section>

      <Section title={P.medicationsSection}>
        {patient.medications.length === 0
          ? <p className="text-gray-600 text-xs italic">{P.noMedications}</p>
          : (
            <div className="space-y-2">
              {patient.medications.map((med, i) => (
                <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-gray-200 text-sm font-medium">{med.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{med.frequency}</p>
                  </div>
                  <span className="text-xs font-mono text-teal-400 bg-teal-950 border border-teal-800 px-2 py-0.5 rounded-lg shrink-0">{med.dose}</span>
                </div>
              ))}
            </div>
          )
        }
      </Section>

      <Section title={P.medicalHistorySection}>
        {patient.medicalHistory.length === 0
          ? <p className="text-gray-600 text-xs italic">{P.noHistory}</p>
          : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
              {patient.medicalHistory.map((h, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
                  <span className="text-gray-300 text-xs">{h}</span>
                </div>
              ))}
            </div>
          )
        }
      </Section>

      <Section title={P.ecgDevice}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-1">
          <InfoRow label={P.deviceId}    value={patient.deviceId} mono />
          <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
            <span className="text-gray-500 text-xs">{P.connection}</span>
            <ConnectionDot status={patient.connectionStatus} />
          </div>
          <InfoRow label={P.lastReading} value={patient.lastReading} mono />
        </div>
      </Section>

      <Section title={P.recentAnomalies}>
        {patient.recentAnomalies.length === 0
          ? <p className="text-gray-600 text-xs italic">{P.noAnomalies}</p>
          : (
            <div className="space-y-2">
              {patient.recentAnomalies.map((a, i) => (
                <div key={i} className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-red-300 text-sm font-medium">{a.type}</p>
                    <p className="text-red-700 text-xs font-mono mt-0.5">{a.timestamp}</p>
                  </div>
                  <span className="text-xs font-mono text-red-400 shrink-0">{a.confidence}{P.confSuffix}</span>
                </div>
              ))}
            </div>
          )
        }
      </Section>

      <Section title={P.insuranceSection}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-1">
          <InfoRow label={P.provider}     value={patient.insurance?.provider} />
          <InfoRow label={P.policyNumber} value={patient.insurance?.policyNumber} mono />
          <InfoRow label={P.expiry}       value={patient.insurance?.expiry} />
        </div>
      </Section>

      {patient.notes && (
        <Section title={P.clinicalNotes}>
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
            <p className="text-gray-300 text-sm leading-relaxed">{patient.notes}</p>
          </div>
        </Section>
      )}
    </div>
  )
}

// ── Doctor detail panel ───────────────────────────────────────────────────────

function DoctorDetail({ doctor, patients, T, onEdit, onRemove, userRole }) {
  const P = T.people
  const assignedPatients = patients.filter(p => doctor.patientIds.includes(p.id))

  return (
    <div className="space-y-6 pb-8">

      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl overflow-hidden border border-indigo-700 shrink-0">
          {doctor.photoUrl ? (
            <img src={doctor.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-indigo-900 flex items-center justify-center">
              <span className="text-indigo-300 font-bold text-lg">{initials(doctor.name)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-lg leading-tight">{doctor.name}</h2>
          <p className="text-gray-400 text-sm mt-0.5">{doctor.specialty} · {doctor.department}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <DoctorStatusBadge status={doctor.status} T={T} />
            <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400">
              {doctor.experience} {P.experienceSuffix}
            </span>
          </div>
          {userRole === 'admin' && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={onEdit} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
                ✎ {P.editDoctor}
              </button>
              <button onClick={onRemove} className="text-xs bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 px-3 py-1.5 rounded-lg transition-colors">
                {P.removeDoctor}
              </button>
            </div>
          )}
        </div>
      </div>

      {doctor.bio && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
          <p className="text-gray-300 text-sm leading-relaxed">{doctor.bio}</p>
        </div>
      )}

      <Section title={P.details}>
        <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-1">
          <InfoRow label={P.license}    value={doctor.license}    mono />
          <InfoRow label={P.email}      value={doctor.email}      mono />
          <InfoRow label={P.phone}      value={doctor.phone}      mono />
          <InfoRow label={P.hospital}   value={doctor.hospital} />
          <InfoRow label={P.department} value={doctor.department} />
          <InfoRow label={P.schedule}   value={doctor.schedule} />
        </div>
      </Section>

      {doctor.qualifications.length > 0 && (
        <Section title={P.qualifications}>
          <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
            {doctor.qualifications.map((q, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <span className="w-1 h-1 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-gray-300 text-xs">{q}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`${P.assignedPatients} (${assignedPatients.length})`}>
        {assignedPatients.length === 0
          ? <p className="text-gray-600 text-xs italic">{P.noPatientsAssigned}</p>
          : (
            <div className="space-y-2">
              {assignedPatients.map(p => (
                <div key={p.id} className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-teal-800 shrink-0">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-teal-900 flex items-center justify-center">
                          <span className="text-teal-300 text-xs font-bold">{initials(p.name)}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-200 text-sm font-medium">{p.name}</p>
                      <p className="text-gray-500 text-xs">{p.primaryDiagnosis ?? '—'}</p>
                    </div>
                  </div>
                  <PatientStatusBadge status={p.status} T={T} />
                </div>
              ))}
            </div>
          )
        }
      </Section>
    </div>
  )
}

// ── List rows ─────────────────────────────────────────────────────────────────

function PatientRow({ patient, selected, onClick, T }) {
  const hasAlert = patient.recentAnomalies.length > 0 && patient.status !== 'discharged'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        selected
          ? 'border-teal-700 bg-teal-950'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-teal-800 shrink-0">
          {patient.photoUrl ? (
            <img src={patient.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-teal-900 flex items-center justify-center">
              <span className="text-teal-300 text-xs font-bold">{initials(patient.name)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-gray-200 text-sm font-medium truncate">{patient.name}</p>
            {hasAlert && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
          </div>
          <p className="text-gray-500 text-xs truncate">{patient.primaryDiagnosis ?? '—'}</p>
        </div>
        <PatientStatusBadge status={patient.status} T={T} />
      </div>
    </button>
  )
}

function DoctorRow({ doctor, selected, onClick, T }) {
  const P = T.people
  const count = doctor.patientIds.length
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        selected
          ? 'border-indigo-700 bg-indigo-950'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-indigo-800 shrink-0">
          {doctor.photoUrl ? (
            <img src={doctor.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-indigo-900 flex items-center justify-center">
              <span className="text-indigo-300 text-xs font-bold">{initials(doctor.name)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-200 text-sm font-medium truncate">{doctor.name}</p>
          <p className="text-gray-500 text-xs">{doctor.specialty} · {count} {count !== 1 ? P.patients : P.patient}</p>
        </div>
        <DoctorStatusBadge status={doctor.status} T={T} />
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function People() {
  const { T } = useLanguage()
  const P = T.people
  const [email, setEmail]                   = useState('')
  const [userRole, setUserRole]             = useState('doctor')
  const [patients, setPatients]             = useState([])
  const [doctors, setDoctors]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [tab, setTab]                       = useState('patients')
  const [query, setQuery]                   = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState(null)
  const [selectedDoctorId,  setSelectedDoctorId]  = useState(null)
  const [showPatientForm,  setShowPatientForm]  = useState(false)
  const [showDoctorForm,   setShowDoctorForm]   = useState(false)
  const [editingPatient,   setEditingPatient]   = useState(null)
  const [editingDoctor,    setEditingDoctor]    = useState(null)
  const [confirmAction,    setConfirmAction]    = useState(null) // { type, target }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: patientRows }, { data: doctorRows }] = await Promise.all([
      supabase.from('patients').select('*').order('created_at', { ascending: false }),
      supabase.from('doctors').select('*').order('name'),
    ])
    const rawPatients = patientRows ?? []
    const rawDoctors  = doctorRows  ?? []
    const mapped = rawDoctors.map(d => mapDoctor(d, rawPatients))
    setPatients(rawPatients.map(mapPatient))
    setDoctors(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? '')
      if (user) {
        supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
          .then(({ data }) => setUserRole(data?.role ?? 'doctor'))
      }
    })
    fetchData()
  }, [fetchData])

  // Auto-select first item when data loads
  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) setSelectedPatientId(patients[0].id)
  }, [patients, selectedPatientId])

  useEffect(() => {
    if (!selectedDoctorId && doctors.length > 0) setSelectedDoctorId(doctors[0].id)
  }, [doctors, selectedDoctorId])

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.primaryDiagnosis ?? '').toLowerCase().includes(query.toLowerCase())
  )

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(query.toLowerCase()) ||
    d.specialty.toLowerCase().includes(query.toLowerCase())
  )

  const selectedPatient = patients.find(p => p.id === selectedPatientId)
  const selectedDoctor  = doctors.find(d => d.id === selectedDoctorId)

  async function handleDischarge(patient) {
    await supabase.from('patients').update({ status: 'discharged', discharge_date: new Date().toISOString().slice(0, 10) }).eq('id', patient.id)
    setConfirmAction(null)
    fetchData()
  }

  async function handleDeletePatient(patient) {
    await supabase.from('patients').delete().eq('id', patient.id)
    setConfirmAction(null)
    setSelectedPatientId(null)
    fetchData()
  }

  async function handleRemoveDoctor(doctor) {
    await supabase.from('doctors').delete().eq('id', doctor.id)
    setConfirmAction(null)
    setSelectedDoctorId(null)
    fetchData()
  }

  async function handleConfirm() {
    if (!confirmAction) return
    if (confirmAction.type === 'discharge')     await handleDischarge(confirmAction.target)
    if (confirmAction.type === 'deletePatient') await handleDeletePatient(confirmAction.target)
    if (confirmAction.type === 'removeDoctor')  await handleRemoveDoctor(confirmAction.target)
  }

  const admittedCount   = patients.filter(p => p.status === 'admitted').length
  const outpatientCount = patients.filter(p => p.status === 'outpatient').length
  const alertCount      = patients.filter(p => p.recentAnomalies.length > 0 && p.status !== 'discharged').length
  const onDutyCount     = doctors.filter(d => d.status === 'on-duty').length

  // ── Pending doctor approvals (admin only) ─────────────────────────────────
  // Query the doctors table directly (status = 'pending') — no admin RLS on profiles needed
  const [pendingDoctors, setPendingDoctors] = useState([])

  const fetchPendingDoctors = useCallback(async () => {
    if (userRole !== 'admin') return
    const { data } = await supabase
      .from('doctors')
      .select('id, name, email, specialty')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setPendingDoctors(data ?? [])
  }, [userRole])

  useEffect(() => { fetchPendingDoctors() }, [fetchPendingDoctors])

  async function approveDoctor(doctorId, doctorEmail) {
    // RPC runs as SECURITY DEFINER — can update profiles via auth.users.email lookup
    await supabase.rpc('approve_pending_doctor', { p_email: doctorEmail })
    fetchPendingDoctors()
    fetchData()
  }

  async function rejectDoctor(doctorId, doctorEmail) {
    await supabase.rpc('reject_pending_doctor', { p_email: doctorEmail })
    fetchPendingDoctors()
    fetchData()
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar email={email} />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 flex flex-col gap-6 flex-1">

        {/* Pending doctor approvals — admin only */}
        {userRole === 'admin' && pendingDoctors.length > 0 && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-widest mb-3">
              {P.pendingApproval} ({pendingDoctors.length})
            </p>
            <div className="space-y-2">
              {pendingDoctors.map(d => (
                <div key={d.id} className="flex items-center justify-between gap-4 bg-yellow-900/30 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-900 border border-yellow-700 flex items-center justify-center shrink-0">
                      <span className="text-yellow-300 text-xs font-bold">
                        {(d.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-200 text-sm font-medium">{d.name}</p>
                      <p className="text-yellow-600 text-xs">{d.specialty} · {d.email}</p>
                      <p className="text-yellow-700 text-xs">{P.awaitingApproval}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approveDoctor(d.id, d.email)}
                      className="text-xs bg-green-900 hover:bg-green-800 text-green-400 border border-green-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      {P.approve}
                    </button>
                    <button
                      onClick={() => rejectDoctor(d.id, d.email)}
                      className="text-xs bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      {P.reject}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white font-semibold text-xl">{P.title}</h1>
            <p className="text-gray-500 text-sm mt-1">{P.subtitle}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowPatientForm(true)}
              className="text-sm bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl transition-colors font-medium"
            >
              {P.newPatient}
            </button>
            {userRole === 'admin' && (
              <button
                onClick={() => setShowDoctorForm(true)}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-colors font-medium"
              >
                {P.addDoctor}
              </button>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: P.totalPatients, value: patients.length, color: 'text-white' },
            { label: P.admitted,      value: admittedCount,   color: 'text-teal-400' },
            { label: P.outpatient,    value: outpatientCount, color: 'text-yellow-400' },
            { label: P.activeAlerts,  value: alertCount,      color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-gray-500 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setTab('patients'); setQuery('') }}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === 'patients' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {P.patientsTab}
              <span className="ml-2 text-xs opacity-60">{patients.length}</span>
            </button>
            <button
              onClick={() => { setTab('doctors'); setQuery('') }}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === 'doctors' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {P.doctorsTab}
              <span className="ml-2 text-xs opacity-60">{doctors.length}</span>
              {onDutyCount > 0 && (
                <span className="ml-1.5 text-xs bg-green-900 text-green-400 px-1.5 rounded-full">{onDutyCount} {P.onDuty}</span>
              )}
            </button>
          </div>

          <input
            type="search"
            placeholder={tab === 'patients' ? P.searchPatients : P.searchDoctors}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-gray-600 transition-colors"
          />
        </div>

        {/* Split layout */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-sm">{P.loading}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1">

            {/* List */}
            <div className="lg:col-span-2 space-y-2 overflow-y-auto max-h-[72vh] pr-1">
              {tab === 'patients' && (
                filteredPatients.length === 0
                  ? <p className="text-gray-600 text-sm italic px-2">
                      {patients.length === 0 ? P.noPatientsYet : P.noPatientsSearch}
                    </p>
                  : filteredPatients.map(p => (
                      <PatientRow
                        key={p.id}
                        patient={p}
                        selected={selectedPatientId === p.id}
                        onClick={() => setSelectedPatientId(p.id)}
                        T={T}
                      />
                    ))
              )}
              {tab === 'doctors' && (
                filteredDoctors.length === 0
                  ? <p className="text-gray-600 text-sm italic px-2">
                      {doctors.length === 0 ? P.noDoctorsYet : P.noDoctorsSearch}
                    </p>
                  : filteredDoctors.map(d => (
                      <DoctorRow
                        key={d.id}
                        doctor={d}
                        selected={selectedDoctorId === d.id}
                        onClick={() => setSelectedDoctorId(d.id)}
                        T={T}
                      />
                    ))
              )}
            </div>

            {/* Detail */}
            <div className="lg:col-span-3 overflow-y-auto max-h-[72vh] bg-gray-900 border border-gray-800 rounded-xl px-5 pt-5">
              {tab === 'patients' && selectedPatient && (
                <PatientDetail
                  patient={selectedPatient}
                  doctor={doctors.find(d => d.id === selectedPatient.doctorId)}
                  T={T}
                  userRole={userRole}
                  onEdit={() => setEditingPatient(selectedPatient)}
                  onPrint={() => printPatient(selectedPatient, doctors.find(d => d.id === selectedPatient.doctorId))}
                  onDischarge={() => setConfirmAction({ type: 'discharge',     target: selectedPatient })}
                  onDelete={()   => setConfirmAction({ type: 'deletePatient', target: selectedPatient })}
                />
              )}
              {tab === 'patients' && !selectedPatient && (
                <p className="text-gray-600 text-sm italic">{P.selectPatient}</p>
              )}
              {tab === 'doctors' && selectedDoctor && (
                <DoctorDetail
                  doctor={selectedDoctor}
                  patients={patients}
                  T={T}
                  userRole={userRole}
                  onEdit={() => setEditingDoctor(selectedDoctor)}
                  onRemove={() => setConfirmAction({ type: 'removeDoctor', target: selectedDoctor })}
                />
              )}
              {tab === 'doctors' && !selectedDoctor && (
                <p className="text-gray-600 text-sm italic">{P.selectDoctor}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showPatientForm && (
        <PatientForm
          doctors={doctors}
          onClose={() => setShowPatientForm(false)}
          onSaved={() => { setShowPatientForm(false); fetchData() }}
        />
      )}
      {showDoctorForm && userRole === 'admin' && (
        <DoctorForm
          onClose={() => setShowDoctorForm(false)}
          onSaved={() => { setShowDoctorForm(false); fetchData() }}
        />
      )}
      {editingPatient && (
        <PatientForm
          doctors={doctors}
          patient={editingPatient}
          onClose={() => setEditingPatient(null)}
          onSaved={() => { setEditingPatient(null); fetchData() }}
        />
      )}
      {editingDoctor && userRole === 'admin' && (
        <DoctorForm
          doctor={editingDoctor}
          onClose={() => setEditingDoctor(null)}
          onSaved={() => { setEditingDoctor(null); fetchData() }}
        />
      )}
      {confirmAction && (() => {
        const cfg = {
          discharge:     { title: T.confirm.dischargeTitle,     message: T.confirm.dischargeMsg,     confirmLabel: T.confirm.dischargeBtn,  danger: false },
          deletePatient: { title: T.confirm.deletePatientTitle, message: T.confirm.deletePatientMsg, confirmLabel: T.confirm.deleteBtn,     danger: true  },
          removeDoctor:  { title: T.confirm.removeDoctorTitle,  message: T.confirm.removeDoctorMsg,  confirmLabel: T.confirm.removeBtn,     danger: true  },
        }[confirmAction.type]
        return (
          <ConfirmModal
            {...cfg}
            onConfirm={handleConfirm}
            onClose={() => setConfirmAction(null)}
          />
        )
      })()}
    </div>
  )
}

export default People
