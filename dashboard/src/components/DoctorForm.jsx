import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import AvatarInput from './AvatarInput'

function doctorToForm(d) {
  return {
    name:           d.name           ?? '',
    specialty:      d.specialty      ?? '',
    license:        d.license        ?? '',
    email:          d.email          ?? '',
    phone:          d.phone          ?? '',
    department:     d.department     ?? '',
    hospital:       d.hospital       ?? '',
    experience:     d.experience     ?? '',
    status:         d.status         ?? 'on-duty',
    schedule:       d.schedule       ?? '',
    bio:            d.bio            ?? '',
    qualifications: d.qualifications?.length > 0 ? d.qualifications : [''],
  }
}

const EMPTY_FORM = {
  name: '',
  specialty: '',
  license: '',
  email: '',
  phone: '',
  department: '',
  hospital: '',
  experience: '',
  status: 'on-duty',
  schedule: '',
  bio: '',
  qualifications: [''],
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

function DoctorForm({ doctor, onClose, onSaved }) {
  const { T } = useLanguage()
  const F = T.doctorForm
  const isEdit = Boolean(doctor)
  const [form, setForm] = useState(() => isEdit ? doctorToForm(doctor) : EMPTY_FORM)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setQual(index, value) {
    setForm(f => {
      const next = [...f.qualifications]
      next[index] = value
      return { ...f, qualifications: next }
    })
  }

  function addQual() {
    setForm(f => ({ ...f, qualifications: [...f.qualifications, ''] }))
  }

  function removeQual(index) {
    setForm(f => ({ ...f, qualifications: f.qualifications.filter((_, i) => i !== index) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim())      { setError(F.nameRequired);     return }
    if (!form.specialty.trim()) { setError(F.specialtyRequired); return }
    if (!form.license.trim())   { setError(F.licenseRequired);  return }
    if (!form.email.trim())     { setError(F.emailRequired);    return }

    setSaving(true)
    setError(null)

    const payload = {
      name:           form.name.trim(),
      specialty:      form.specialty.trim(),
      license:        form.license.trim(),
      email:          form.email.trim(),
      phone:          form.phone || null,
      department:     form.department || null,
      hospital:       form.hospital || null,
      experience:     form.experience ? Number(form.experience) : 0,
      status:         form.status,
      schedule:       form.schedule || null,
      bio:            form.bio || null,
      qualifications: form.qualifications.filter(q => q.trim()),
    }

    let err
    if (isEdit) {
      // Upload new photo if selected
      if (photoBlob) {
        const path = `${doctor.id}/photo.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('doctor-photos')
          .upload(path, photoBlob, { upsert: true, contentType: 'image/jpeg' })
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('doctor-photos').getPublicUrl(path)
          payload.photo_url = `${publicUrl}?t=${Date.now()}`
        }
      }
      ;({ error: err } = await supabase.from('doctors').update(payload).eq('id', doctor.id))
    } else {
      // INSERT first to get the ID, then upload photo
      const { data: inserted, error: insertErr } = await supabase
        .from('doctors').insert([payload]).select('id').single()
      err = insertErr
      if (!insertErr && photoBlob && inserted?.id) {
        const path = `${inserted.id}/photo.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('doctor-photos')
          .upload(path, photoBlob, { upsert: true, contentType: 'image/jpeg' })
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('doctor-photos').getPublicUrl(path)
          await supabase.from('doctors')
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
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold">{isEdit ? T.people.editDoctor : F.title}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full border border-indigo-800 bg-indigo-950 text-indigo-400">{F.adminOnly}</span>
            </div>
            <p className="text-gray-500 text-xs mt-0.5">{isEdit ? doctor.name : F.subtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors">✕</button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 flex-1 space-y-1">

          {/* Photo upload */}
          <AvatarInput
            photoUrl={doctor?.photoUrl ?? null}
            name={form.name}
            accentColor="indigo"
            hint={F.photoHint}
            onBlobReady={blob => setPhotoBlob(blob)}
          />

          <SectionTitle>{F.identity}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{F.fullName} *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder={F.namePlaceholder} required />
            </div>
            <div>
              <Label>{F.specialty} *</Label>
              <Input value={form.specialty} onChange={e => set('specialty', e.target.value)} placeholder="Cardiology" required />
            </div>
            <div>
              <Label>{F.license} *</Label>
              <Input value={form.license} onChange={e => set('license', e.target.value)} placeholder="MD-2024-00001" required />
            </div>
            <div>
              <Label>{F.experience}</Label>
              <Input type="number" min="0" value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="10" />
            </div>
            <div>
              <Label>{F.status}</Label>
              <Select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="on-duty">{F.onDuty}</option>
                <option value="off-duty">{F.offDuty}</option>
              </Select>
            </div>
          </div>

          <SectionTitle>{F.contact}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{F.email} *</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="doctor@hospital.dz" required />
            </div>
            <div>
              <Label>{F.phone}</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+213 555 000 000" />
            </div>
          </div>

          <SectionTitle>{F.workplace}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{F.department}</Label>
              <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="Cardiology" />
            </div>
            <div>
              <Label>{F.hospital}</Label>
              <Input value={form.hospital} onChange={e => set('hospital', e.target.value)} placeholder="CHU Mustapha Pacha" />
            </div>
            <div className="col-span-2">
              <Label>{F.schedule}</Label>
              <Input value={form.schedule} onChange={e => set('schedule', e.target.value)} placeholder={F.schedulePlaceholder} />
            </div>
          </div>

          <SectionTitle>{F.qualifications}</SectionTitle>
          <div className="space-y-2">
            {form.qualifications.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input value={q} onChange={e => setQual(i, e.target.value)} placeholder={F.qualPlaceholder} />
                {form.qualifications.length > 1 && <RemoveButton onClick={() => removeQual(i)} />}
              </div>
            ))}
            <button
              type="button"
              onClick={addQual}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
            >
              + {F.addQualification}
            </button>
          </div>

          <SectionTitle>{F.biography}</SectionTitle>
          <Textarea
            value={form.bio}
            onChange={e => set('bio', e.target.value)}
            placeholder={F.bioPlaceholder}
          />

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
            className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-colors font-medium"
          >
            {saving ? F.saving : isEdit ? T.people.updateDoctor : F.save}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DoctorForm
