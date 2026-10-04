import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import AvatarInput from './AvatarInput'

function patientToForm(p) {
  return {
    name:                     p.name                           ?? '',
    dob:                      p.dob                            ?? '',
    gender:                   p.gender                         ?? 'Male',
    bloodType:                p.bloodType                      ?? '',
    phone:                    p.phone                          ?? '',
    email:                    p.email                          ?? '',
    address:                  p.address                        ?? '',
    emergencyContactName:     p.emergencyContact?.name         ?? '',
    emergencyContactRelation: p.emergencyContact?.relation     ?? '',
    emergencyContactPhone:    p.emergencyContact?.phone        ?? '',
    weight:                   p.weight                         ?? '',
    height:                   p.height                         ?? '',
    status:                   p.status                         ?? 'admitted',
    admissionDate:            p.admissionDate                  ?? '',
    dischargeDate:            p.dischargeDate                  ?? '',
    ward:                     p.ward                           ?? '',
    room:                     p.room                           ?? '',
    bed:                      p.bed                            ?? '',
    insuranceProvider:        p.insurance?.provider            ?? '',
    insurancePolicyNumber:    p.insurance?.policyNumber        ?? '',
    insuranceExpiry:          p.insurance?.expiry              ?? '',
    doctorId:                 p.doctorId                       ?? '',
    primaryDiagnosis:         p.primaryDiagnosis               ?? '',
    secondaryDiagnoses:       p.secondaryDiagnoses?.length > 0 ? p.secondaryDiagnoses : [''],
    allergies:                p.allergies?.length > 0          ? p.allergies            : [''],
    medications:              p.medications?.length > 0        ? p.medications          : [{ name: '', dose: '', frequency: '' }],
    medicalHistory:           p.medicalHistory?.length > 0     ? p.medicalHistory       : [''],
    notes:                    p.notes                          ?? '',
  }
}

const EMPTY_FORM = {
  name: '',
  dob: '',
  gender: 'Male',
  bloodType: '',
  phone: '',
  email: '',
  address: '',
  emergencyContactName: '',
  emergencyContactRelation: '',
  emergencyContactPhone: '',
  weight: '',
  height: '',
  status: 'admitted',
  admissionDate: '',
  dischargeDate: '',
  ward: '',
  room: '',
  bed: '',
  insuranceProvider: '',
  insurancePolicyNumber: '',
  insuranceExpiry: '',
  doctorId: '',
  primaryDiagnosis: '',
  secondaryDiagnoses: [''],
  allergies: [''],
  medications: [{ name: '', dose: '', frequency: '' }],
  medicalHistory: [''],
  notes: '',
}

function Label({ children }) {
  return <p className="text-xs text-gray-400 mb-1">{children}</p>
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
    />
  )
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none focus:border-gray-500 transition-colors"
    >
      {children}
    </select>
  )
}

function Textarea({ ...props }) {
  return (
    <textarea
      {...props}
      rows={3}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-gray-500 transition-colors resize-none"
    />
  )
}

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 mt-6 first:mt-0">
      {children}
    </p>
  )
}

function AddButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-teal-400 hover:text-teal-300 mt-2 transition-colors"
    >
      + {label}
    </button>
  )
}

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-gray-600 hover:text-red-400 text-xs px-2 transition-colors shrink-0"
    >
      ✕
    </button>
  )
}

function PatientForm({ doctors, patient, onClose, onSaved }) {
  const { T } = useLanguage()
  const F = T.patientForm
  const isEdit = Boolean(patient)
  const [form, setForm] = useState(() => isEdit ? patientToForm(patient) : EMPTY_FORM)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setArr(field, index, value) {
    setForm(f => {
      const next = [...f[field]]
      next[index] = value
      return { ...f, [field]: next }
    })
  }

  function addArr(field, empty) {
    setForm(f => ({ ...f, [field]: [...f[field], empty] }))
  }

  function removeArr(field, index) {
    setForm(f => ({ ...f, [field]: f[field].filter((_, i) => i !== index) }))
  }

  function setMed(index, key, value) {
    setForm(f => {
      const next = f.medications.map((m, i) => i === index ? { ...m, [key]: value } : m)
      return { ...f, medications: next }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(F.nameRequired); return }
    if (!form.primaryDiagnosis.trim()) { setError(F.diagnosisRequired); return }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name:                       form.name.trim(),
      dob:                        form.dob || null,
      gender:                     form.gender || null,
      blood_type:                 form.bloodType || null,
      phone:                      form.phone || null,
      email:                      form.email || null,
      address:                    form.address || null,
      emergency_contact_name:     form.emergencyContactName || null,
      emergency_contact_relation: form.emergencyContactRelation || null,
      emergency_contact_phone:    form.emergencyContactPhone || null,
      weight:                     form.weight ? Number(form.weight) : null,
      height:                     form.height ? Number(form.height) : null,
      status:                     form.status,
      admission_date:             form.admissionDate || null,
      discharge_date:             form.dischargeDate || null,
      ward:                       form.ward || null,
      room:                       form.room || null,
      bed:                        form.bed || null,
      insurance_provider:         form.insuranceProvider || null,
      insurance_policy_number:    form.insurancePolicyNumber || null,
      insurance_expiry:           form.insuranceExpiry || null,
      doctor_id:                  form.doctorId || null,
      primary_diagnosis:          form.primaryDiagnosis.trim(),
      secondary_diagnoses:        form.secondaryDiagnoses.filter(d => d.trim()),
      allergies:                  form.allergies.filter(a => a.trim()),
      medications:                form.medications.filter(m => m.name.trim()),
      medical_history:            form.medicalHistory.filter(h => h.trim()),
      notes:                      form.notes || null,
      created_by:                 user?.id ?? null,
    }

    let err
    if (isEdit) {
      // If a new photo was selected, upload it and attach the URL
      if (photoBlob) {
        const path = `${patient.id}/photo.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('patient-photos')
          .upload(path, photoBlob, { upsert: true, contentType: 'image/jpeg' })
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('patient-photos').getPublicUrl(path)
          payload.photo_url = `${publicUrl}?t=${Date.now()}`
        }
      }
      ;({ error: err } = await supabase.from('patients').update(payload).eq('id', patient.id))
    } else {
      // INSERT first to get the generated ID, then upload photo
      const { data: inserted, error: insertErr } = await supabase
        .from('patients').insert([payload]).select('id').single()
      err = insertErr
      if (!insertErr && photoBlob && inserted?.id) {
        const path = `${inserted.id}/photo.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('patient-photos')
          .upload(path, photoBlob, { upsert: true, contentType: 'image/jpeg' })
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('patient-photos').getPublicUrl(path)
          await supabase.from('patients')
            .update({ photo_url: `${publicUrl}?t=${Date.now()}` })
            .eq('id', inserted.id)
        }
      }
    }
    setSaving(false)

    if (err) {
      setError(err.message)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-white font-semibold">{isEdit ? T.people.editPatient : F.title}</h2>
            <p className="text-gray-500 text-xs mt-0.5">{isEdit ? patient.name : F.subtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors">✕</button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 flex-1 space-y-1">

          {/* Photo upload */}
          <AvatarInput
            photoUrl={patient?.photoUrl ?? null}
            name={form.name}
            accentColor="teal"
            hint={F.photoHint}
            onBlobReady={blob => setPhotoBlob(blob)}
          />

          <SectionTitle>{F.personalInfo}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{F.fullName} *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder={F.namePlaceholder} required />
            </div>
            <div>
              <Label>{F.dob}</Label>
              <Input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} />
            </div>
            <div>
              <Label>{F.gender}</Label>
              <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="Male">{F.male}</option>
                <option value="Female">{F.female}</option>
                <option value="Other">{F.other}</option>
              </Select>
            </div>
            <div>
              <Label>{F.bloodType}</Label>
              <Select value={form.bloodType} onChange={e => set('bloodType', e.target.value)}>
                <option value="">{F.select}</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label>{F.weight}</Label>
              <Input type="number" min="0" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="75" />
            </div>
            <div>
              <Label>{F.height}</Label>
              <Input type="number" min="0" value={form.height} onChange={e => set('height', e.target.value)} placeholder="175" />
            </div>
          </div>

          <SectionTitle>{F.contact}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{F.phone}</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+213 555 000 000" />
            </div>
            <div>
              <Label>{F.email}</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="patient@email.com" />
            </div>
            <div className="col-span-2">
              <Label>{F.address}</Label>
              <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="12 Rue Didouche Mourad, Algiers" />
            </div>
          </div>

          <SectionTitle>{F.emergencyContact}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>{F.ecName}</Label>
              <Input value={form.emergencyContactName} onChange={e => set('emergencyContactName', e.target.value)} placeholder={F.ecName} />
            </div>
            <div>
              <Label>{F.ecRelation}</Label>
              <Input value={form.emergencyContactRelation} onChange={e => set('emergencyContactRelation', e.target.value)} placeholder={F.ecRelationPlaceholder} />
            </div>
            <div>
              <Label>{F.ecPhone}</Label>
              <Input value={form.emergencyContactPhone} onChange={e => set('emergencyContactPhone', e.target.value)} placeholder="+213 555 000 000" />
            </div>
          </div>

          <SectionTitle>{F.admission}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{F.status}</Label>
              <Select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="admitted">{F.statusAdmitted}</option>
                <option value="outpatient">{F.statusOutpatient}</option>
                <option value="discharged">{F.statusDischarged}</option>
              </Select>
            </div>
            <div>
              <Label>{F.assignedDoctor}</Label>
              <Select value={form.doctorId} onChange={e => set('doctorId', e.target.value)}>
                <option value="">{F.none}</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>{F.admissionDate}</Label>
              <Input type="date" value={form.admissionDate} onChange={e => set('admissionDate', e.target.value)} />
            </div>
            <div>
              <Label>{F.dischargeDate}</Label>
              <Input type="date" value={form.dischargeDate} onChange={e => set('dischargeDate', e.target.value)} />
            </div>
            <div>
              <Label>{F.ward}</Label>
              <Input value={form.ward} onChange={e => set('ward', e.target.value)} placeholder={F.wardPlaceholder} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{F.room}</Label>
                <Input value={form.room} onChange={e => set('room', e.target.value)} placeholder="3B" />
              </div>
              <div>
                <Label>{F.bed}</Label>
                <Input value={form.bed} onChange={e => set('bed', e.target.value)} placeholder="2" />
              </div>
            </div>
          </div>

          <SectionTitle>{F.diagnoses}</SectionTitle>
          <div className="space-y-3">
            <div>
              <Label>{F.primaryDiagnosis} *</Label>
              <Input value={form.primaryDiagnosis} onChange={e => set('primaryDiagnosis', e.target.value)} placeholder={F.afibPlaceholder} required />
            </div>
            <div>
              <Label>{F.secondaryDiagnoses}</Label>
              <div className="space-y-2">
                {form.secondaryDiagnoses.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={d} onChange={e => setArr('secondaryDiagnoses', i, e.target.value)} placeholder="e.g. Hypertension" />
                    {form.secondaryDiagnoses.length > 1 && <RemoveButton onClick={() => removeArr('secondaryDiagnoses', i)} />}
                  </div>
                ))}
                <AddButton onClick={() => addArr('secondaryDiagnoses', '')} label={F.addDiagnosis} />
              </div>
            </div>
          </div>

          <SectionTitle>{F.allergies}</SectionTitle>
          <div className="space-y-2">
            {form.allergies.map((a, i) => (
              <div key={i} className="flex gap-2">
                <Input value={a} onChange={e => setArr('allergies', i, e.target.value)} placeholder="e.g. Penicillin" />
                {form.allergies.length > 1 && <RemoveButton onClick={() => removeArr('allergies', i)} />}
              </div>
            ))}
            <AddButton onClick={() => addArr('allergies', '')} label={F.addAllergy} />
          </div>

          <SectionTitle>{F.medications}</SectionTitle>
          <div className="space-y-2">
            {form.medications.map((med, i) => (
              <div key={i} className="grid grid-cols-7 gap-2 items-center">
                <div className="col-span-3">
                  {i === 0 && <Label>{F.medName}</Label>}
                  <Input value={med.name} onChange={e => setMed(i, 'name', e.target.value)} placeholder="Metoprolol" />
                </div>
                <div className="col-span-1">
                  {i === 0 && <Label>{F.medDose}</Label>}
                  <Input value={med.dose} onChange={e => setMed(i, 'dose', e.target.value)} placeholder="50mg" />
                </div>
                <div className="col-span-3">
                  {i === 0 && <Label>{F.medFrequency}</Label>}
                  <div className="flex gap-2">
                    <Input value={med.frequency} onChange={e => setMed(i, 'frequency', e.target.value)} placeholder="Twice daily" />
                    {form.medications.length > 1 && <RemoveButton onClick={() => removeArr('medications', i)} />}
                  </div>
                </div>
              </div>
            ))}
            <AddButton onClick={() => addArr('medications', { name: '', dose: '', frequency: '' })} label={F.addMedication} />
          </div>

          <SectionTitle>{F.medicalHistory}</SectionTitle>
          <div className="space-y-2">
            {form.medicalHistory.map((h, i) => (
              <div key={i} className="flex gap-2">
                <Input value={h} onChange={e => setArr('medicalHistory', i, e.target.value)} placeholder="e.g. Hypertension (2015)" />
                {form.medicalHistory.length > 1 && <RemoveButton onClick={() => removeArr('medicalHistory', i)} />}
              </div>
            ))}
            <AddButton onClick={() => addArr('medicalHistory', '')} label={F.addEntry} />
          </div>

          <SectionTitle>{F.insurance}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{T.people.provider}</Label>
              <Input value={form.insuranceProvider} onChange={e => set('insuranceProvider', e.target.value)} placeholder="CNAS Algeria" />
            </div>
            <div>
              <Label>{F.policyNumber}</Label>
              <Input value={form.insurancePolicyNumber} onChange={e => set('insurancePolicyNumber', e.target.value)} placeholder="CN-2023-0045821" />
            </div>
            <div>
              <Label>{F.expiryDate}</Label>
              <Input type="date" value={form.insuranceExpiry} onChange={e => set('insuranceExpiry', e.target.value)} />
            </div>
          </div>

          <SectionTitle>{F.clinicalNotes}</SectionTitle>
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="…" />

          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-xl transition-colors"
          >
            {F.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-colors font-medium"
          >
            {saving ? F.saving : isEdit ? T.people.updatePatient : F.save}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PatientForm
