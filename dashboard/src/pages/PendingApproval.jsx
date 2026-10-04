import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

export default function PendingApproval() {
  const { T } = useLanguage()
  const P = T.pending

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-900 border border-yellow-700 mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        {/* Text */}
        <h1 className="text-white text-xl font-semibold mb-2">{P.title}</h1>
        <p className="text-gray-400 text-sm mb-1">{P.subtitle}</p>
        <p className="text-gray-600 text-xs leading-relaxed mb-8 max-w-sm mx-auto">{P.message}</p>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-yellow-800 bg-yellow-950 text-yellow-400 text-sm mb-8">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          {P.statusLabel}
        </div>

        {/* Sign out */}
        <div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            {P.signOut}
          </button>
        </div>
      </div>
    </div>
  )
}
