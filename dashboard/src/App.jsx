import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { LanguageProvider } from './lib/i18n'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import People from './pages/People'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import EmergencyResponse from './pages/EmergencyResponse'
import PatientPortal from './pages/PatientPortal'
import PendingApproval from './pages/PendingApproval'
import Admin from './pages/Admin'

function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)  // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
        // Complete any registration deferred by email confirmation.
        // IMPORTANT: only apply if the pending email matches the session email exactly —
        // prevents overwriting an existing user's profile when they log in on the same browser.
        if (event === 'SIGNED_IN') {
          const raw = localStorage.getItem('ecg-pending-reg')
          if (raw) {
            try {
              const reg = JSON.parse(raw)
              if (reg.email?.toLowerCase() === session.user.email?.toLowerCase()) {
                localStorage.removeItem('ecg-pending-reg')
                const uid = session.user.id
                if (reg.tab === 'doctor') {
                  await supabase.from('profiles').upsert({ id: uid, role: 'doctor', status: 'pending', display_name: reg.name })
                  await supabase.from('doctors').insert({ name: reg.name, email: reg.email, specialty: reg.specialty, license: reg.license, hospital: reg.hospital || null, status: 'pending' })
                } else {
                  await supabase.from('profiles').upsert({ id: uid, role: 'patient', status: 'active', display_name: reg.name })
                  await supabase.from('patients').insert({ name: reg.name, email: reg.email, dob: reg.dob || null, status: 'outpatient', primary_diagnosis: 'Pending review' })
                }
                fetchProfile(uid)
              }
            } catch (_) { /* corrupt data — ignore */ }
          }
        }
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(uid) {
    const { data } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', uid)
      .single()
    // null means no profile row — deny all access until one is created
    setProfile(data ?? null)
  }

  // Loading
  if (session === undefined || (session && profile === undefined)) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    )
  }

  // Signed in but no profile row yet — email confirmed but inserts still pending, or orphaned auth user.
  // Show a waiting screen; the onAuthStateChange handler will complete registration and re-fetch.
  if (session && profile === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-indigo-900 border border-indigo-700 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Setting up your account…</p>
          <p className="text-gray-500 text-sm">This will only take a moment.</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const role   = profile?.role   ?? null
  const status = profile?.status ?? null
  // Every flag requires both a live session AND a profile row with the right values.
  // profile=null (no DB row yet) grants nothing — prevents new users bypassing the pending gate.
  const isPatient = Boolean(session) && role === 'patient'  && status === 'active'
  const isPending = Boolean(session) && (role === 'doctor' || role === 'admin') && status === 'pending'
  const isStaff   = Boolean(session) && (role === 'doctor' || role === 'admin') && status === 'active'
  const isAdmin   = Boolean(session) && role === 'admin'   && status === 'active'

  // Smart redirect after login
  function afterLogin() {
    if (!profile) return '/login'
    if (isPatient) return '/portal'
    if (isPending) return '/pending'
    if (isStaff || isAdmin) return '/dashboard'
    return '/login'
  }

  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={!session ? <Login />    : <Navigate to={afterLogin()} />} />
          <Route path="/register" element={!session ? <Register /> : <Navigate to={afterLogin()} />} />

          {/* Staff only */}
          <Route path="/dashboard" element={isStaff   ? <Dashboard />        : <Navigate to={session ? afterLogin() : '/login'} />} />
          <Route path="/people"    element={isStaff   ? <People />           : <Navigate to={session ? afterLogin() : '/login'} />} />
          <Route path="/alerts"    element={isStaff   ? <Alerts />           : <Navigate to={session ? afterLogin() : '/login'} />} />
          <Route path="/response"  element={isStaff   ? <EmergencyResponse /> : <Navigate to={session ? afterLogin() : '/login'} />} />
          <Route path="/settings"  element={session   ? <Settings />         : <Navigate to="/login" />} />

          {/* Patient portal */}
          <Route path="/portal"   element={isPatient  ? <PatientPortal />    : <Navigate to={session ? afterLogin() : '/login'} />} />

          {/* Admin panel — admin role only */}
          <Route path="/admin"    element={isAdmin    ? <Admin />            : <Navigate to={session ? afterLogin() : '/login'} />} />

          {/* Pending approval */}
          <Route path="/pending"  element={isPending  ? <PendingApproval />  : <Navigate to={session ? afterLogin() : '/login'} />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={session ? afterLogin() : '/login'} />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
