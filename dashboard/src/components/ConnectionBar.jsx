import { useLanguage } from '../lib/i18n'

function ConnectionBar({ status }) {
  const { T } = useLanguage()

  const config = {
    simulated:    { color: 'bg-gray-900 border-gray-800',   dot: 'bg-gray-500',                   text: 'text-gray-400' },
    connected:    { color: 'bg-teal-950 border-teal-900',   dot: 'bg-teal-400 animate-pulse',      text: 'text-teal-400' },
    disconnected: { color: 'bg-red-950 border-red-900',     dot: 'bg-red-400',                     text: 'text-red-400' },
    reconnecting: { color: 'bg-amber-950 border-amber-900', dot: 'bg-amber-400 animate-pulse',     text: 'text-amber-400' },
  }

  const c = config[status] || config.simulated

  return (
    <div className={`border-b px-6 py-1.5 flex items-center gap-2 ${c.color}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`}/>
      <span className={`text-xs ${c.text}`}>{T.connectionBar[status] ?? T.connectionBar.simulated}</span>
    </div>
  )
}

export default ConnectionBar
