import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANGES = [
  { key: '1h',  label: '1 h',  hours: 1  },
  { key: '6h',  label: '6 h',  hours: 6  },
  { key: '24h', label: '24 h', hours: 24 },
]

function formatTime(isoString, rangeKey) {
  const d = new Date(isoString)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return rangeKey === '1h' ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit, color }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="font-bold font-mono text-sm" style={{ color }}>
        {payload[0].value} <span className="text-gray-500 font-normal text-xs">{unit}</span>
      </p>
    </div>
  )
}

// ── Single metric area chart ──────────────────────────────────────────────────

function MetricChart({ data, dataKey, label, unit, color, gradientId, domain }) {
  const isEmpty = data.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{label}</p>
        <span className="text-xs text-gray-600">{unit}</span>
      </div>

      {isEmpty ? null : (
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: '#4b5563', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={domain}
              tick={{ fill: '#4b5563', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              content={props => <ChartTooltip {...props} unit={unit} color={color} />}
              cursor={{ stroke: '#374151', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, stroke: '#030712', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Charts renderer (shared by both modes) ───────────────────────────────────

function Charts({ data, patientId }) {
  const { T } = useLanguage()
  const SC = T.statCards
  return (
    <div className="space-y-6">
      <MetricChart
        data={data}
        dataKey="heartRate"
        label={SC.heartRate}
        unit="bpm"
        color="#f87171"
        gradientId={`hr-grad-${patientId}`}
        domain={['auto', 'auto']}
      />
      <MetricChart
        data={data}
        dataKey="spo2"
        label={SC.spo2}
        unit="%"
        color="#2dd4bf"
        gradientId={`spo2-grad-${patientId}`}
        domain={[88, 100]}
      />
      <MetricChart
        data={data}
        dataKey="rrInterval"
        label={SC.rrInterval}
        unit="ms"
        color="#818cf8"
        gradientId={`rr-grad-${patientId}`}
        domain={['auto', 'auto']}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Props:
 *   patientId  — the patient's UUID (always required)
 *   localData  — optional Point[] from Dashboard's in-memory ring buffer.
 *                When provided the component renders that data directly and
 *                never touches the database (simulation mode).
 *                When absent it fetches from vitals_history (real data mode,
 *                used by the People page patient record).
 */
function VitalsChart({ patientId, localData }) {
  // ── DB mode (People page — real data only) ────────────────────────────────
  const [range,   setRange]   = useState('1h')
  const [dbData,  setDbData]  = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDb = useCallback(async () => {
    if (!patientId || localData) return   // skip when localData is provided
    setLoading(true)
    const hours = RANGES.find(r => r.key === range)?.hours ?? 1
    const since = new Date(Date.now() - hours * 3_600_000).toISOString()

    const { data: rows } = await supabase
      .from('vitals_history')
      .select('recorded_at, heart_rate, spo2, rr_interval')
      .eq('patient_id', patientId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .limit(500)

    setDbData(
      (rows ?? []).map(r => ({
        time:       formatTime(r.recorded_at, range),
        heartRate:  r.heart_rate,
        spo2:       r.spo2,
        rrInterval: r.rr_interval,
      }))
    )
    setLoading(false)
  }, [patientId, range, localData])

  useEffect(() => { fetchDb() }, [fetchDb])

  const { T } = useLanguage()
  const V = T.vitals

  // ── Local (simulation) mode ───────────────────────────────────────────────
  if (localData) {
    const isEmpty = localData.length === 0
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            {V.history}
          </p>
          <span className="text-xs text-gray-600 italic">{V.session}</span>
        </div>

        {isEmpty ? (
          <div className="text-center py-6">
            <p className="text-gray-600 text-xs">{V.trendWait}</p>
          </div>
        ) : (
          <Charts data={localData} patientId={patientId} />
        )}
      </div>
    )
  }

  // ── DB mode ───────────────────────────────────────────────────────────────
  const isEmpty = !loading && dbData.length === 0

  return (
    <div className="space-y-5">

      {/* Header row with range selector */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          {V.history}
        </p>
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium ${
                range === r.key
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-600 text-xs italic text-center py-6">{T.people.loading}</p>
      ) : isEmpty ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <p className="text-gray-600 text-xs">{V.noHistory}</p>
          <p className="text-gray-700 text-xs mt-0.5">{V.realDevice}</p>
        </div>
      ) : (
        <Charts data={dbData} patientId={patientId} />
      )}
    </div>
  )
}

export default VitalsChart
