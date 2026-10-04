import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

function Register() {
  const { T } = useLanguage()
  const R = T.register

  const [tab,        setTab]      = useState('doctor')   // 'doctor' | 'patient'
  const [saving,     setSaving]   = useState(false)
  const [error,      setError]    = useState(null)
  const [done,       setDone]     = useState(false)       // show success/pending screen
  const [emailWarn,  setEmailWarn] = useState(false)      // inline email format hint

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    specialty: '', license: '', hospital: '',
    dob: '',
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim())  { setError(R.nameRequired);  return }
    if (!form.email.trim()) { setError(R.emailRequired); return }

    // Validate email format — must be a real-looking address (user@domain.tld)
    const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
    const FAKE_DOMAINS = ['mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com', 'trashmail.com', 'yopmail.com', 'sharklasers.com', 'dispostable.com', 'maildrop.cc']
    const emailVal = form.email.trim().toLowerCase()
    if (!EMAIL_RE.test(emailVal)) { setError(R.emailInvalid); return }
    const domain = emailVal.split('@')[1]
    if (FAKE_DOMAINS.includes(domain)) { setError(R.emailInvalid); return }

    if (form.password.length < 6) { setError(R.passwordShort); return }
    if (form.password !== form.confirm) { setError(R.passwordMismatch); return }
    if (tab === 'doctor' && !form.specialty.trim()) { setError(R.specialtyRequired); return }
    if (tab === 'doctor' && !form.license.trim())   { setError(R.licenseRequired);   return }

    setSaving(true)

    // 1 — Check email uniqueness before creating auth user
    const checkTable = tab === 'doctor' ? 'doctors' : 'patients'
    const { data: existing } = await supabase
      .from(checkTable)
      .select('id')
      .eq('email', form.email.trim())
      .maybeSingle()
    if (existing) { setError(R.emailTaken); setSaving(false); return }

    // 2 — Create Supabase auth user
    const { data: { user, session: newSession }, error: signUpErr } = await supabase.auth.signUp({
      email:    form.email.trim(),
      password: form.password,
      options:  { data: { display_name: form.name.trim() } },
    })

    if (signUpErr) { setError(signUpErr.message); setSaving(false); return }

    // Supabase silently returns existing user when email confirmation is off — detect it
    if (!user?.identities || user.identities.length === 0) {
      setError(R.emailTaken); setSaving(false); return
    }

    const uid = user?.id
    if (!uid) { setError('Signup failed — please try again.'); setSaving(false); return }

    // Email confirmation is ON — session is null until the user clicks the link.
    // Save registration data to localStorage; App.jsx will complete the inserts
    // once the confirmed session fires via onAuthStateChange.
    if (!newSession) {
      localStorage.setItem('ecg-pending-reg', JSON.stringify({
        tab,
        name:      form.name.trim(),
        email:     form.email.trim(),
        specialty: form.specialty.trim(),
        license:   form.license.trim(),
        hospital:  form.hospital  || null,
        dob:       form.dob       || null,
      }))
      setSaving(false)
      setDone(true)
      return
    }

    // Email confirmation is OFF — insert records immediately with the live session
    if (tab === 'doctor') {
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id:           uid,
        role:         'doctor',
        status:       'pending',
        display_name: form.name.trim(),
      })
      if (profileErr) { setError(`Profile error: ${profileErr.message}`); setSaving(false); return }

      const { error: doctorErr } = await supabase.from('doctors').insert({
        name:      form.name.trim(),
        email:     form.email.trim(),
        specialty: form.specialty.trim(),
        license:   form.license.trim(),
        hospital:  form.hospital || null,
        status:    'pending',
      })
      if (doctorErr) { setError(`Doctor record error: ${doctorErr.message}`); setSaving(false); return }

    } else {
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id:           uid,
        role:         'patient',
        status:       'active',
        display_name: form.name.trim(),
      })
      if (profileErr) { setError(`Profile error: ${profileErr.message}`); setSaving(false); return }

      const { error: patientErr } = await supabase.from('patients').insert({
        name:              form.name.trim(),
        email:             form.email.trim(),
        dob:               form.dob || null,
        status:            'outpatient',
        primary_diagnosis: 'Pending review',
      })
      if (patientErr) { setError(`Patient record error: ${patientErr.message}`); setSaving(false); return }
    }

    setSaving(false)
    setDone(true)
    // Auth state change in App.jsx will handle redirect for patients
  }

  // ── Success / pending screen ─────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">

          {/* Email icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-900 border border-indigo-700 mb-5">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>

          <h2 className="text-white font-bold text-2xl mb-2">{R.confirmEmailTitle}</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-2">{R.confirmEmailMessage}</p>
          <p className="text-gray-500 text-xs leading-relaxed mb-6">
            {tab === 'doctor' ? R.confirmEmailDoctorNote : R.confirmEmailPatientNote}
          </p>

          {/* Visual step indicator */}
          <div className="flex items-center justify-center gap-3 mb-8">
            {[
              { label: R.step1, done: true },
              { label: tab === 'doctor' ? R.step2Doctor : R.step2Patient, done: false },
              ...(tab === 'doctor' ? [{ label: R.step3Doctor, done: false }] : []),
            ].map((s, i, arr) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                    s.done ? 'border-teal-500 bg-teal-950 text-teal-400' : 'border-gray-700 bg-gray-900 text-gray-600'
                  }`}>
                    {s.done
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : i + 1
                    }
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{s.label}</span>
                </div>
                {i < arr.length - 1 && <div className="w-8 h-px bg-gray-800 mb-4"/>}
              </div>
            ))}
          </div>

          <Link
            to="/login"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
          >
            {R.backToLogin}
          </Link>
        </div>
      </div>
    )
  }

  // ── Registration form ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">{R.title}</h1>
          <p className="text-gray-400 text-sm mt-1">{R.subtitle}</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">

          {/* Flow notice */}
          {tab === 'doctor' ? (
            <div className="mb-5 bg-indigo-950 border border-indigo-800 rounded-xl px-4 py-3 flex gap-3">
              <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-indigo-300 text-xs leading-relaxed">{R.doctorFlowNote}</p>
            </div>
          ) : (
            <div className="mb-5 bg-teal-950 border border-teal-800 rounded-xl px-4 py-3 flex gap-3">
              <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-teal-300 text-xs leading-relaxed">{R.patientFlowNote}</p>
            </div>
          )}

          {/* Tab selector */}
          <div className="flex bg-gray-800 rounded-xl p-1 mb-6 gap-1">
            {[
              { key: 'doctor',  label: R.doctorTab  },
              { key: 'patient', label: R.patientTab },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setTab(key); setError(null) }}
                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
                  tab === key
                    ? key === 'doctor'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-teal-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Full name */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{R.fullName} *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder={R.namePlaceholder}
                required
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-teal-500 placeholder-gray-600"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{R.email} *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => { set('email', e.target.value); setEmailWarn(false) }}
                onBlur={() => {
                  const v = form.email.trim()
                  if (!v) return
                  const ok = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(v)
                  setEmailWarn(!ok)
                }}
                placeholder="you@hospital.com"
                required
                className={`w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border focus:outline-none placeholder-gray-600 transition-colors ${
                  emailWarn ? 'border-red-600 focus:border-red-500' : 'border-gray-700 focus:border-teal-500'
                }`}
              />
              {emailWarn && (
                <p className="text-red-400 text-xs mt-1.5">{R.emailInvalid}</p>
              )}
            </div>

            {/* Doctor-only fields */}
            {tab === 'doctor' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">{R.specialty} *</label>
                    <input
                      type="text"
                      value={form.specialty}
                      onChange={e => set('specialty', e.target.value)}
                      placeholder="Cardiology"
                      className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">{R.license} *</label>
                    <input
                      type="text"
                      value={form.license}
                      onChange={e => set('license', e.target.value)}
                      placeholder="MD-2024-001"
                      className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">{R.hospital}</label>
                  <input
                    type="text"
                    value={form.hospital}
                    onChange={e => set('hospital', e.target.value)}
                    placeholder="Menzel Bourguiba Regional Hospital"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                  />
                </div>
              </>
            )}

            {/* Patient-only fields */}
            {tab === 'patient' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{R.dob}</label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={e => set('dob', e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{R.password} *</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-teal-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{R.confirmPassword} *</label>
              <input
                type="password"
                value={form.confirm}
                onChange={e => set('confirm', e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-teal-500 placeholder-gray-600"
              />
            </div>

            {error && (
              <div className="px-4 py-2.5 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Pending note for doctors */}
            {tab === 'doctor' && (
              <div className="px-4 py-3 bg-yellow-950 border border-yellow-800 rounded-lg text-yellow-400 text-xs leading-relaxed">
                {R.doctorNote}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className={`w-full disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors ${
                tab === 'doctor'
                  ? 'bg-indigo-600 hover:bg-indigo-500'
                  : 'bg-teal-600 hover:bg-teal-500'
              }`}
            >
              {saving ? R.creating : R.createAccount}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-4">
          {R.alreadyHaveAccount}{' '}
          <Link to="/login" className="text-teal-400 hover:text-teal-300 transition-colors">
            {R.signIn}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Register
