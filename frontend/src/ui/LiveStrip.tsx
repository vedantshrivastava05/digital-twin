import { useEffect, useState } from 'react'
import { STATUS_COLORS } from '../constants'
import { useFactoryStore } from '../store'
import type { MachineStatus } from '../types'

interface Sample {
  ts: string
  value: number
}

interface StateSegment {
  state: MachineStatus
  from: string
  until: string
}

function Sparkline({ samples, color }: { samples: Sample[]; color: string }) {
  if (samples.length < 2) return <div className="spark-empty">collecting…</div>
  const values = samples.map((s) => s.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = samples
    .map((s, i) => {
      const x = (i / (samples.length - 1)) * 100
      const y = 28 - ((s.value - min) / range) * 24
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

function StateGantt({ segments }: { segments: StateSegment[] }) {
  if (segments.length === 0) return null
  const start = new Date(segments[0].from).getTime()
  const end = Math.max(
    new Date(segments[segments.length - 1].until).getTime(),
    start + 1,
  )
  const total = end - start
  return (
    <div className="gantt">
      {segments.map((seg, i) => {
        const from = new Date(seg.from).getTime()
        const until = new Date(seg.until).getTime()
        const width = ((until - from) / total) * 100
        if (width <= 0) return null
        return (
          <div
            key={i}
            className="gantt-seg"
            style={{ width: `${width}%`, background: STATUS_COLORS[seg.state] }}
            title={`${seg.state}: ${new Date(seg.from).toLocaleTimeString()} – ${new Date(seg.until).toLocaleTimeString()}`}
          />
        )
      })}
    </div>
  )
}

/** Live sensor values, sparklines, and a state Gantt for one machine */
export function LiveStrip({ instanceId }: { instanceId: string }) {
  const live = useFactoryStore((s) => s.telemetry[instanceId])
  const wsConnected = useFactoryStore((s) => s.wsConnected)
  const [history, setHistory] = useState<Record<string, Sample[]>>({})
  const [segments, setSegments] = useState<StateSegment[]>([])

  useEffect(() => {
    setHistory({})
    setSegments([])
    const load = () => {
      fetch(`/api/telemetry/history/${instanceId}`)
        .then((r) => r.json())
        .then(setHistory)
        .catch(() => {})
      fetch(`/api/telemetry/state-log/${instanceId}`)
        .then((r) => r.json())
        .then(setSegments)
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [instanceId])

  const hasTelemetry = live || (history.temperature?.length ?? 0) > 0
  if (!hasTelemetry) {
    return (
      <div className="live-strip">
        <h4>Telemetry</h4>
        <p className="dim">No tags mapped — bind them in the Tag Mapper.</p>
      </div>
    )
  }

  return (
    <div className="live-strip">
      <h4>
        Telemetry
        <span className={`live-dot${wsConnected ? ' on' : ''}`} />
        {wsConnected ? 'live' : 'reconnecting'}
      </h4>
      <div className="sensor-row">
        <div className="sensor">
          <span className="sensor-label">Temp</span>
          <span className="sensor-value">
            {live?.temperature != null ? `${live.temperature.toFixed(1)} °C` : '—'}
          </span>
          <Sparkline samples={history.temperature ?? []} color="#f97316" />
        </div>
        <div className="sensor">
          <span className="sensor-label">Current</span>
          <span className="sensor-value">
            {live?.current != null ? `${live.current.toFixed(1)} A` : '—'}
          </span>
          <Sparkline samples={history.current ?? []} color="#38bdf8" />
        </div>
      </div>
      <div className="sensor-row">
        <div className="sensor small">
          <span className="sensor-label">Cycles</span>
          <span className="sensor-value">{live?.cycle_count ?? '—'}</span>
        </div>
        <div className="sensor small">
          <span className="sensor-label">Energy</span>
          <span className="sensor-value">
            {live?.energy != null ? `${live.energy.toFixed(1)} kWh` : '—'}
          </span>
        </div>
      </div>
      <h4>State timeline</h4>
      <StateGantt segments={segments} />
    </div>
  )
}
