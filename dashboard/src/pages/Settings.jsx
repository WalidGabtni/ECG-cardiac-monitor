import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import Navbar from '../components/Navbar'
import CropModal, { getCroppedBlob } from '../components/CropModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?'
  const n = name.includes('@') ? name.split('@')[0] : name
  return n.split(/[\s._-]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      {children}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
      {children}
    </p>
  )
}

function Label({ children }) {
  return <p className="text-xs text-gray-400 mb-1">{children}</p>
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    />
  )
}

function SuccessBanner({ message }) {
  return (
    <div className="flex items-center gap-2 text-xs text-teal-400 bg-teal-950 border border-teal-800 rounded-xl px-4 py-2.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {message}
    </div>
  )
}

function ErrorBanner({ message }) {
  return (
    <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-xl px-4 py-2.5">
      {message}
    </p>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Settings() {
  const { T } = useLanguage()
  const S = T.settings

  const [user,        setUser]        = useState(null)
  const [role,        setRole]        = useState('doctor')
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl,   setAvatarUrl]   = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [cropSrc,     setCropSrc]     = useState(null) // raw image for crop modal
  const [nameStatus,  setNameStatus]  = useState(null)
  const [savingName,  setSavingName]  = useState(false)

  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwStatus,        setPwStatus]        = useState(null)
  const [savingPw,        setSavingPw]        = useState(false)

  const fileInputRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUser(user)
      supabase
        .from('profiles')
        .select('role, display_name, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setRole(data?.role ?? 'doctor')
          setDisplayName(data?.display_name ?? '')
          setAvatarUrl(data?.avatar_url ?? null)
        })
    })
  }, [])

  /** When user picks a file, open the crop modal instead of uploading directly */
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so picking the same file again still triggers onChange
    e.target.value = ''

    if (!file.type.startsWith('image/')) {
      setNameStatus({ ok: false, msg: S.avatarInvalidType })
      return
    }
    if (file.size > 10 * 1024 * 1024) { // allow up to 10 MB before crop
      setNameStatus({ ok: false, msg: S.avatarTooLarge })
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result)
    reader.readAsDataURL(file)
  }

  /** Called with the cropped Blob after the user clicks Apply in the modal */
  async function handleCropApply(blob) {
    setCropSrc(null)
    if (!user) return
    setUploading(true)
    setNameStatus(null)

    const path = `${user.id}/avatar.jpg`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

    if (uploadError) {
      setUploading(false)
      setNameStatus({ ok: false, msg: uploadError.message })
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ avatar_url: urlWithBust })
      .eq('id', user.id)

    setUploading(false)

    if (dbError) {
      setNameStatus({ ok: false, msg: dbError.message })
    } else {
      setAvatarUrl(urlWithBust)
      setNameStatus({ ok: true, msg: S.avatarSaved })
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSavingName(true)
    setNameStatus(null)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id)
    setSavingName(false)
    setNameStatus(error
      ? { ok: false, msg: error.message }
      : { ok: true,  msg: S.profileSaved }
    )
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwStatus(null)
    if (newPassword.length < 6)          { setPwStatus({ ok: false, msg: S.passwordTooShort }); return }
    if (newPassword !== confirmPassword) { setPwStatus({ ok: false, msg: S.passwordMismatch });  return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPw(false)
    if (error) {
      setPwStatus({ ok: false, msg: error.message })
    } else {
      setPwStatus({ ok: true, msg: S.passwordChanged })
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const avatarLabel = displayName || user?.email || ''

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar email={user?.email ?? ''} />

      <div className="max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-6">

        {/* Page header */}
        <div>
          <h1 className="text-white font-semibold text-xl">{S.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{S.subtitle}</p>
        </div>

        {/* Profile card */}
        <Card>
          <SectionTitle>{S.profile}</SectionTitle>

          {/* Avatar row */}
          <div className="flex items-center gap-4 mb-6">

            {/* Clickable avatar */}
            <div className="relative group shrink-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-full overflow-hidden cursor-pointer ring-2 ring-indigo-700 group-hover:ring-indigo-400 transition-all"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-indigo-900 flex items-center justify-center">
                    <span className="text-indigo-300 font-bold text-xl">{initials(avatarLabel)}</span>
                  </div>
                )}
              </div>

              {/* Camera / spinner overlay */}
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Name / email / role */}
            <div className="min-w-0">
              <p className="text-white font-medium text-base truncate">
                {displayName || <span className="text-gray-500 italic">{S.noDisplayName}</span>}
              </p>
              <p className="text-gray-500 text-xs mt-0.5 truncate">{user?.email}</p>
              <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${
                role === 'admin'
                  ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                  : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {role === 'admin' ? S.roleAdmin : S.roleDoctor}
              </span>
              <p className="text-gray-600 text-xs mt-2">{S.avatarHint}</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <Label>{S.displayName}</Label>
              <Input
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setNameStatus(null) }}
                placeholder={S.displayNamePlaceholder}
              />
            </div>
            <div>
              <Label>{S.email}</Label>
              <Input value={user?.email ?? ''} disabled />
            </div>
            <div>
              <Label>{S.role}</Label>
              <Input value={role === 'admin' ? S.roleAdmin : S.roleDoctor} disabled />
            </div>

            {nameStatus && (
              nameStatus.ok
                ? <SuccessBanner message={nameStatus.msg} />
                : <ErrorBanner   message={nameStatus.msg} />
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingName}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-colors font-medium"
              >
                {savingName ? S.savingProfile : S.saveProfile}
              </button>
            </div>
          </form>
        </Card>

        {/* Security card */}
        <Card>
          <SectionTitle>{S.security}</SectionTitle>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label>{S.newPassword}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setPwStatus(null) }}
                placeholder={S.passwordPlaceholder}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label>{S.confirmPassword}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setPwStatus(null) }}
                placeholder={S.passwordPlaceholder}
                autoComplete="new-password"
              />
            </div>

            {pwStatus && (
              pwStatus.ok
                ? <SuccessBanner message={pwStatus.msg} />
                : <ErrorBanner   message={pwStatus.msg} />
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingPw}
                className="text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-colors font-medium"
              >
                {savingPw ? S.changingPassword : S.changePassword}
              </button>
            </div>
          </form>
        </Card>

      </div>

      {/* Crop modal — rendered outside the card so it covers the full screen */}
      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onCancel={() => setCropSrc(null)}
          onApply={handleCropApply}
        />
      )}
    </div>
  )
}

export default Settings
