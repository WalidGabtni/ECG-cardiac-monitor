import { useLanguage } from '../lib/i18n'

function LocationCard({ eta, distance, anomalyActive }) {
  const { T } = useLanguage()
  const L = T.locationCard

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">{L.title}</span>
        {anomalyActive && (
          <span className="text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
            {L.trackingActive}
          </span>
        )}
      </div>

      <div className="relative bg-gray-800 rounded-lg overflow-hidden mb-3" style={{ height: '140px' }}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="35" x2="100%" y2="35" stroke="#374151" strokeWidth="0.5"/>
          <line x1="0" y1="70" x2="100%" y2="70" stroke="#374151" strokeWidth="0.5"/>
          <line x1="0" y1="105" x2="100%" y2="105" stroke="#374151" strokeWidth="0.5"/>
          <line x1="80" y1="0" x2="80" y2="100%" stroke="#374151" strokeWidth="0.5"/>
          <line x1="180" y1="0" x2="180" y2="100%" stroke="#374151" strokeWidth="0.5"/>
          <line x1="280" y1="0" x2="280" y2="100%" stroke="#374151" strokeWidth="0.5"/>
          <line x1="380" y1="0" x2="380" y2="100%" stroke="#374151" strokeWidth="0.5"/>
          <rect x="60" y="55" width="60" height="8" rx="2" fill="#1f2937"/>
          <rect x="160" y="40" width="80" height="8" rx="2" fill="#1f2937"/>
          <rect x="0" y="80" width="100" height="8" rx="2" fill="#1f2937"/>
          <rect x="240" y="60" width="120" height="8" rx="2" fill="#1f2937"/>
          {anomalyActive && (
            <line x1="110" y1="90" x2="300" y2="38" stroke="#0891B2" strokeWidth="1.5" strokeDasharray="5 3"/>
          )}
          <circle cx="110" cy="90" r="7" fill="#ef4444"/>
          <text x="110" y="94" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">P</text>
          <rect x="288" y="26" width="24" height="24" rx="4" fill="#185FA5"/>
          <text x="300" y="42" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold">H</text>
        </svg>
        {!anomalyActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-600 text-xs">{L.activateOnAnomaly}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">{L.eta}</p>
          <p className={`text-sm font-medium ${anomalyActive ? 'text-white' : 'text-gray-600'}`}>
            {anomalyActive ? eta : '— min'}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">{L.distance}</p>
          <p className={`text-sm font-medium ${anomalyActive ? 'text-white' : 'text-gray-600'}`}>
            {anomalyActive ? distance : '— km'}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-700 mt-3 text-center">{L.mapsNote}</p>
    </div>
  )
}

export default LocationCard
