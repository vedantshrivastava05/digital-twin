import { useEffect, useState } from 'react'
import { fetchTwin } from '../api'
import type { TwinDto } from '../types'
import { OpsNav } from './OpsNav'

interface DefectCode {
  code: string
  label: string
}

interface QualityLogRow {
  id: string
  machine_name: string
  defect: string
  qty: number
  note: string
  logged_at: string
}

interface ParetoRow {
  defect_code: string
  defect: string
  qty: number
}

export function QualityPage() {
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [codes, setCodes] = useState<DefectCode[]>([])
  const [logs, setLogs] = useState<QualityLogRow[]>([])
  const [pareto, setPareto] = useState<ParetoRow[]>([])
  const [machineId, setMachineId] = useState('')
  const [defectCode, setDefectCode] = useState('')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')

  const refresh = () => {
    fetch('/api/quality/logs').then((r) => r.json()).then(setLogs)
    fetch('/api/quality/pareto').then((r) => r.json()).then(setPareto)
  }

  useEffect(() => {
    fetchTwin().then(setTwin)
    fetch('/api/quality/defect-codes').then((r) => r.json()).then(setCodes)
    refresh()
  }, [])

  const log = async () => {
    if (!machineId || !defectCode) return
    await fetch(`/api/machines/${machineId}/quality`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defect_code: defectCode,
        qty: parseInt(qty || '1', 10),
        note,
      }),
    })
    setNote('')
    setQty('1')
    refresh()
  }

  const maxQty = Math.max(1, ...pareto.map((p) => p.qty))

  return (
    <div className="ops-page">
      <OpsNav active="quality" />
      <header className="ops-header">
        <h1>Quality — defect logging</h1>
      </header>

      <div className="order-form">
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
          <option value="">Machine…</option>
          {twin?.instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select value={defectCode} onChange={(e) => setDefectCode(e.target.value)}>
          <option value="">Defect…</option>
          {codes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          style={{ width: 70 }}
        />
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <button onClick={log} disabled={!machineId || !defectCode}>
          Log defect
        </button>
      </div>

      <div className="dash-columns">
        <section className="dash-section">
          <h2>Scrap Pareto — 7 days</h2>
          {pareto.map((p) => (
            <div key={p.defect_code} className="pareto-row light">
              <span className="pareto-label">{p.defect}</span>
              <div className="pareto-bar-track">
                <div
                  className="pareto-bar"
                  style={{ width: `${(p.qty / maxQty) * 100}%`, background: '#dc2626' }}
                />
              </div>
              <span className="pareto-value">{p.qty} pcs</span>
            </div>
          ))}
          {pareto.length === 0 && <p>No defects recorded.</p>}
        </section>

        <section className="dash-section">
          <h2>Recent defect logs</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Machine</th>
                <th>Defect</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.logged_at).toLocaleString()}</td>
                  <td>{row.machine_name}</td>
                  <td>
                    {row.defect}
                    {row.note ? ` — ${row.note}` : ''}
                  </td>
                  <td>{row.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
