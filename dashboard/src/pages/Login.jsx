import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

function Login() {
  const { T } = useLanguage()
  const L = T.login

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">ECG Monitor</h1>
          <p className="text-gray-400 text-sm mt-1">{L.subtitle}</p>
        </div>

        <form onSubmit={handleLogin} className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">{L.email}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@hospital.com"
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-1.5">{L.password}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-teal-500"
            />
          </div>

          {error && (
            <div className="mb-4 px-4 py-2.5 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? L.signingIn : L.signIn}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-4">
          {L.noAccount}{' '}
          <Link to="/register" className="text-teal-400 hover:text-teal-300 transition-colors">
            {L.register}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
