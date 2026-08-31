import { useEffect, useState } from 'react'
import { OpsNav } from './OpsNav'

interface SimResult {
  bodies: number
  bodies_per_hour: number
  stops: number
  stop_minutes: number
  effective_cycle_s: number
  hours: number
}

interface WhatIfResult {
  baseline: SimResult
  scenario: SimResult
  delta_bodies: number
  delta_pct: number
  note: string
}

function ResultCard({ title, result, accent }: { title: string; result: SimResult; accent?: boolean }) {
  return (
    <div className={`whatif-card${accent ? ' accent' : ''}`}>
      <h3>{title}</h3>
      <div className="whatif-big">{result.bodies}</div>
      <p className="dim">bodies over {result.hours} h</p>
      <ul>
        <li>{result.bodies_per_hour} bodies/hour</li>
        <li>{result.effective_cycle_s}s effective cycle</li>
        <li>
          {result.stops} stops · {result.stop_minutes} min lost
        </li>
      </ul>
    </div>
  )
}

export function WhatIfPage() {
  const [cycle, setCycle] = useState(75)
  const [index, setIndex] = useState(6)
  const [availability, setAvailability] = useState(88)
  const [shifts, setShifts] = useState(2)
  const [result, setResult] = useState<WhatIfResult | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/copilot/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stations: 8,
          cycle_time_s: cycle,
          index_time_s: index,
          availability: availability / 100,
          shifts,
        }),
      })
      setResult(await res.json())
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="ops-page">
      <OpsNav active="whatif" />
      <header className="ops-header">
        <h1>What-if — body line simulation</h1>
        <p className="ops-note">
          Discrete-event simulation with random micro-stops (seeded, reproducible)
        </p>
      </header>

      <div className="whatif-controls">
        <label>
          Station cycle time: <strong>{cycle}s</strong>
          <input
            type="range"
            min={45}
            max={110}
            value={cycle}
            onChange={(e) => setCycle(Number(e.target.value))}
          />
        </label>
        <label>
          Index time: <strong>{index}s</strong>
          <input
            type="range"
            min={3}
            max={15}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
        </label>
        <label>
          Availability: <strong>{availability}%</strong>
          <input
            type="range"
            min={60}
            max={99}
            value={availability}
            onChange={(e) => setAvailability(Number(e.target.value))}
          />
        </label>
        <label>
          Shifts per day: <strong>{shifts}</strong>
          <input
            type="range"
            min={1}
            max={3}
            value={shifts}
            onChange={(e) => setShifts(Number(e.target.value))}
          />
        </label>
        <button className="advance" onClick={run} disabled={busy}>
          {busy ? 'Simulating…' : 'Run simulation'}
        </button>
      </div>

      {result && (
        <>
          <div className="whatif-results">
            <ResultCard title="Baseline (current line)" result={result.baseline} />
            <div className="whatif-delta">
              <span
                className="whatif-delta-num"
                style={{ color: result.delta_bodies >= 0 ? '#16a34a' : '#dc2626' }}
              >
                {result.delta_bodies >= 0 ? '+' : ''}
                {result.delta_bodies}
              </span>
              <span className="dim">
                bodies ({result.delta_pct >= 0 ? '+' : ''}
                {result.delta_pct}%)
              </span>
            </div>
            <ResultCard title="Your scenario" result={result.scenario} accent />
          </div>
          <p className="ops-note" style={{ marginTop: 14 }}>
            {result.note}
          </p>
        </>
      )}
    </div>
  )
}
