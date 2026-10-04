import { useEffect, useState, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

function initials(str) {
  if (!str) return '?'
  // If it looks like an email, use the part before @
  const name = str.includes('@') ? str.split('@')[0] : str
  return name.split(/[\s._-]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Navbar({ email, activeAlerts = 0 }) {
  const location = useLocation()
  const { lang, setLang, T } = useLanguage()
  const [time,          setTime]          = useState('')
  const [uptime,        setUptime]        = useState(0)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [displayName,   setDisplayName]   = useState('')
  const [avatarUrl,     setAvatarUrl]     = useState(null)
  const [userRole,      setUserRole]      = useState(null)
  const [pendingCount,  setPendingCount]  = useState(0)
  const menuRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date()
      setTime(
        n.getHours().toString().padStart(2, '0') + ':' +
        n.getMinutes().toString().padStart(2, '0') + ':' +
        n.getSeconds().toString().padStart(2, '0')
      )
      setUptime(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch display name, avatar, and role from profiles
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('display_name, avatar_url, role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.display_name) setDisplayName(data.display_name)
          if (data?.avatar_url)   setAvatarUrl(data.avatar_url)
          if (data?.role)         setUserRole(data.role)
          if (data?.role === 'admin') {
            // Poll pending doctor count so admin sees the badge without opening the panel
            supabase
              .from('doctors')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
              .then(({ count }) => setPendingCount(count ?? 0))
          }
        })
    })
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function formatUptime(sec) {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0')
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const avatarLabel = displayName || email || ''

  return (
    <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">

      {/* Left — logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <span className="text-white font-medium text-sm">{T.nav.title}</span>
        <span className="bg-teal-950 text-teal-400 text-xs px-2 py-0.5 rounded-full border border-teal-800">{T.nav.live}</span>
      </div>

      {/* Centre — nav links */}
      <nav className="hidden sm:flex items-center gap-1">
        {[
          { to: '/dashboard', label: T.nav.dashboard },
          { to: '/people',    label: T.nav.people },
          { to: '/alerts',    label: T.nav.alerts },
          { to: '/response',  label: T.nav.response, badge: activeAlerts },
        ].map(({ to, label, badge }) => (
          <Link
            key={to}
            to={to}
            className={`relative px-3 py-1.5 rounded-lg text-xs transition-colors ${
              location.pathname === to
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Right — clock, lang toggle, user menu */}
      <div className="flex items-center gap-4">

        {/* Clock + uptime */}
        <div className="hidden sm:flex items-center gap-3 text-xs">
          <div className="text-gray-400">
            <span className="text-gray-600 mr-1">{T.nav.time}</span>
            {time}
          </div>
          <div className="w-px h-3 bg-gray-700"/>
          <div className="text-gray-400">
            <span className="text-gray-600 mr-1">{T.nav.uptime}</span>
            {formatUptime(uptime)}
          </div>
        </div>

        <div className="w-px h-3 bg-gray-700 hidden sm:block"/>

        {/* Language toggle */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {['en', 'fr'].map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`text-xs px-2 py-1 rounded-md transition-colors font-medium ${
                lang === l ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="w-px h-3 bg-gray-700 hidden sm:block"/>

        {/* User avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-2 group"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg border border-indigo-700 group-hover:border-indigo-500 overflow-hidden transition-colors shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-indigo-900 flex items-center justify-center">
                  <span className="text-indigo-300 text-xs font-bold">{initials(avatarLabel)}</span>
                </div>
              )}
            </div>
            {/* Chevron */}
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform hidden sm:block ${menuOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden">

              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl border border-indigo-700 overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-indigo-900 flex items-center justify-center">
                      <span className="text-indigo-300 text-xs font-bold">{initials(avatarLabel)}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {displayName || email}
                  </p>
                  {displayName && (
                    <p className="text-gray-500 text-xs truncate mt-0.5">{email}</p>
                  )}
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {userRole === 'admin' && (
                  <Link
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      location.pathname === '/admin'
                        ? 'text-purple-300 bg-purple-950'
                        : 'text-purple-400 hover:text-purple-200 hover:bg-purple-950'
                    }`}
                  >
                    {/* Shield icon */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <span className="flex-1">{T.nav.admin}</span>
                    {pendingCount > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-yellow-500 text-gray-950 text-[11px] font-bold flex items-center justify-center">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    location.pathname === '/settings'
                      ? 'text-white bg-gray-800'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {/* Gear icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                  </svg>
                  {T.nav.settings}
                </Link>

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
                >
                  {/* Sign out icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  {T.nav.signOut}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default Navbar
