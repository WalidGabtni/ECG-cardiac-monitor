import { useLanguage } from '../lib/i18n'

function StatCard({ label, value, unit, sub, danger }) {
  return (
    <div className={`rounded-xl p-4 border ${danger ? 'bg-red-950 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
      <p className={`text-xs uppercase tracking-wide mb-1 ${danger ? 'text-red-400' : 'text-gray-400'}`}>
        {label}
      </p>
      <p className={`text-2xl font-medium ${danger ? 'text-red-400' : 'text-white'}`}>
        {value}
        {unit && <span className="text-sm font-normal ml-1 text-gray-400">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function StatCards({ heartRate, status, anomaly, confidence, rrInterval, spo2 }) {
  const { T } = useLanguage()
  const S = T.statCards

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      <StatCard
        label={S.heartRate}
        value={heartRate}
        unit="bpm"
        sub={S.updatedLive}
        danger={heartRate > 100 || heartRate < 50}
      />
      <StatCard
        label={S.status}
        value={status}
        sub={anomaly ? `${anomaly}${confidence ? ` — ${confidence}%` : ''}` : S.noAnomaly}
        danger={status === 'ALERT'}
      />
      <StatCard
        label={S.rrInterval}
        value={rrInterval}
        unit="ms"
        sub={S.beatToBeat}
        danger={rrInterval < 600 || rrInterval > 1200}
      />
      <StatCard
        label={S.spo2}
        value={spo2}
        unit="%"
        sub={S.bloodOxygen}
        danger={spo2 < 95}
      />
      <StatCard
        label={S.patient}
        value="Ahmed B."
        sub={S.patientSub}
      />
      <StatCard
        label={S.battery}
        value="84"
        unit="%"
        sub={S.batteryRemaining}
      />
    </div>
  )
}

export default StatCards
