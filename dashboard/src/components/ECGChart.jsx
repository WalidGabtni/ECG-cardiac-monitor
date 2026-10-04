import { useEffect, useRef } from 'react'

function pqrst(phase) {
  const p = 0.15 * Math.exp(-Math.pow((phase - 0.10) / 0.040, 2))
  const q = -0.05 * Math.exp(-Math.pow((phase - 0.22) / 0.015, 2))
  const r =  1.00 * Math.exp(-Math.pow((phase - 0.26) / 0.018, 2))
  const s = -0.20 * Math.exp(-Math.pow((phase - 0.31) / 0.015, 2))
  const t =  0.25 * Math.exp(-Math.pow((phase - 0.45) / 0.065, 2))
  return p + q + r + s + t
}

const PREDICTION_LABELS = {
  NORM: 'Normal sinus rhythm',
  MI:   'Myocardial infarction',
  STTC: 'ST/T change',
  CD:   'Conduction disorder',
  HYP:  'Hypertrophy',
}

/**
 * samples  — float array from ESP32 ecg_buffer column, or null for simulation
 * mode     — 'normal' | 'afib' | 'st'  (simulation mode, ignored when real data present)
 * prediction — 'NORM' | 'MI' | 'STTC' | 'CD' | 'HYP'  (from current_prediction)
 */
function ECGChart({ mode = 'normal', samples = null, prediction = null }) {
  const canvasRef  = useRef(null)
  const ringRef    = useRef({ data: new Float32Array(500).fill(0), cursor: 0, t: 0 })
  const queueRef   = useRef([])   // playback queue for real samples
  const isRealRef  = useRef(false)
  const animRef    = useRef(null)

  // ── Enqueue new real samples whenever the prop changes ──────────────────────
  useEffect(() => {
    if (!samples || samples.length === 0) {
      isRealRef.current = false
      return
    }
    isRealRef.current = true

    // Data comes pre-normalized to [-1, 1] from the ESP32 model samples
    queueRef.current.push(...samples)
    // Cap queue so we never fall more than ~3 s behind
    if (queueRef.current.length > 1500) {
      queueRef.current = queueRef.current.slice(-1000)
    }
  }, [samples])

  // ── Single animation loop — reads from queue (real) or generates (sim) ──────
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const BUFFER = 500
    const ring   = ringRef.current

    function resize() {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    function getSimSample() {
      ring.t += 0.008
      const t = ring.t
      if (mode === 'afib') {
        const irr   = 0.55 + 0.15 * Math.sin(t * 1.3)
        const phase = (t % irr) / irr
        return 0.04 * (Math.random() - 0.5) + (phase > 0.15 && phase < 0.55 ? pqrst(phase) * 0.7 : 0)
      }
      if (mode === 'st') {
        const phase = (t % 0.7) / 0.7
        return pqrst(phase) + (phase > 0.3 && phase < 0.55 ? 0.35 : 0) + 0.01 * (Math.random() - 0.5)
      }
      const phase = (t % 0.75) / 0.75
      return pqrst(phase) + 0.008 * (Math.random() - 0.5)
    }

    function draw() {
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight

      if (isRealRef.current) {
        // 1 sample/frame at 60fps ≈ 60 samples/s — clinical scroll speed (~8s per screen)
        for (let i = 0; i < 1; i++) {
          const sample = queueRef.current.length > 0
            ? queueRef.current.shift()
            : ring.data[(ring.cursor - 1 + BUFFER) % BUFFER] // hold last value when queue empty
          ring.data[ring.cursor] = sample
          ring.cursor = (ring.cursor + 1) % BUFFER
        }
      } else {
        // Generate simulated samples
        for (let i = 0; i < 3; i++) {
          ring.data[ring.cursor] = getSimSample()
          ring.cursor = (ring.cursor + 1) % BUFFER
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, 0, W, H)

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth   = 0.5
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // Waveform colour per class
      // Colors ordered by clinical severity (low → high)
      const PRED_COLORS = {
        NORM: '#10b981', // green   — normal, no concern
        HYP:  '#eab308', // yellow  — mild, chronic monitoring
        CD:   '#f97316', // orange  — moderate, significant
        STTC: '#f43f5e', // rose    — high, possible ischemia
        MI:   '#ef4444', // red     — critical, emergency
      }
      const simColor = mode === 'normal' ? '#10b981' : '#ef4444'
      ctx.strokeStyle = isRealRef.current && prediction
        ? (PRED_COLORS[prediction] ?? '#10b981')
        : simColor
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      const step = W / BUFFER
      for (let i = 0; i < BUFFER; i++) {
        const idx = (ring.cursor + i) % BUFFER
        const x   = i * step
        const y   = H / 2 - ring.data[idx] * H * 0.36
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Class label watermark on canvas
      if (isRealRef.current && prediction) {
        ctx.font = 'bold 11px monospace'
        ctx.fillStyle = PRED_COLORS[prediction] ?? '#10b981'
        ctx.globalAlpha = 0.5
        ctx.fillText(prediction, 8, 16)
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [mode, prediction]) // restarts only when mode or prediction changes

  // ── Badge label ──────────────────────────────────────────────────────────────
  const isReal    = samples && samples.length > 0
  const badgeText = isReal && prediction
    ? PREDICTION_LABELS[prediction] ?? prediction
    : mode === 'afib' ? 'AFib detected' : mode === 'st' ? 'ST elevation' : 'Normal sinus rhythm'

  const BADGE_STYLES = {
    NORM: 'bg-green-950  border-green-800  text-green-400',  // normal
    HYP:  'bg-yellow-950 border-yellow-800 text-yellow-400', // mild
    CD:   'bg-orange-950 border-orange-800 text-orange-400', // moderate
    STTC: 'bg-rose-950   border-rose-800   text-rose-400',   // high
    MI:   'bg-red-950    border-red-800    text-red-400',    // critical
  }
  const badgeStyle = isReal && prediction
    ? (BADGE_STYLES[prediction] ?? BADGE_STYLES.NORM)
    : (mode === 'normal' ? 'bg-teal-950 border-teal-800 text-teal-400' : 'bg-red-950 border-red-800 text-red-400')

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">Live ECG — Lead I</span>
          {isReal && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-teal-950 border-teal-800 text-teal-400">
              ESP32
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeStyle}`}>
          {badgeText}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '200px', display: 'block' }}
      />
    </div>
  )
}

export default ECGChart
