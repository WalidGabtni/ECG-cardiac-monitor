import { useLanguage } from '../lib/i18n'

function AlertLog({ alerts }) {
  const { T } = useLanguage()

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">{T.alertLog.title}</span>
        <span className="text-xs text-gray-500">
          {alerts.filter(a => a.level === 'critical').length} {T.alertLog.criticalToday}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {alerts.length === 0 && (
          <p className="text-gray-600 text-xs py-2">{T.alertLog.noAlerts}</p>
        )}
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs ${
              alert.level === 'critical'
                ? 'bg-red-950 border-red-800'
                : alert.level === 'warn'
                ? 'bg-amber-950 border-amber-800'
                : 'bg-gray-800 border-gray-700'
            }`}
          >
            <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${
              alert.level === 'critical' ? 'bg-red-400' :
              alert.level === 'warn'     ? 'bg-amber-400' : 'bg-gray-500'
            }`} />
            <span className={`flex-1 ${
              alert.level === 'critical' ? 'text-red-300' :
              alert.level === 'warn'     ? 'text-amber-300' : 'text-gray-400'
            }`}>
              {alert.message}
            </span>
            <span className="text-gray-600 whitespace-nowrap">{alert.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AlertLog
