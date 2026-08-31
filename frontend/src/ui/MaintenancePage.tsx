import { useEffect, useState } from 'react'
import { fetchTwin } from '../api'
import type { TwinDto } from '../types'
import { OpsNav } from './OpsNav'

interface WorkOrderRow {
  id: string
  instance_id: string
  machine_name: string
  type: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'done'
  priority: string
  due_date: string | null
  created_at: string
}

interface PMRow {
  id: string
  machine_name: string
  title: string
  interval_days: number | null
  interval_runtime_h: number | null
  last_done: string
  runtime_h_since: number
  next_due_date: string | null
  due: boolean
  due_reason: string | null
}

interface SparePartRow {
  id: string
  sku: string
  name: string
  qty: number
  min_qty: number
  location: string
  low: boolean
}

const WO_NEXT: Record<string, string | null> = {
  open: 'in_progress',
  in_progress: 'done',
  done: null,
}

export function MaintenancePage() {
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([])
  const [pms, setPms] = useState<PMRow[]>([])
  const [parts, setParts] = useState<SparePartRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [woMachine, setWoMachine] = useState('')
  const [woTitle, setWoTitle] = useState('')
  const [woPriority, setWoPriority] = useState('medium')

  const refresh = () => {
    fetch('/api/work-orders').then((r) => r.json()).then(setWorkOrders)
    fetch('/api/pm-schedules').then((r) => r.json()).then(setPms)
    fetch('/api/spare-parts').then((r) => r.json()).then(setParts)
  }

  useEffect(() => {
    fetchTwin().then(setTwin)
    refresh()
  }, [])

  const createWo = async () => {
    if (!woMachine || !woTitle.trim()) return
    await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: woMachine,
        title: woTitle.trim(),
        priority: woPriority,
      }),
    })
    setWoTitle('')
    setShowForm(false)
    refresh()
  }

  const advanceWo = async (wo: WorkOrderRow) => {
    const next = WO_NEXT[wo.status]
    if (!next) return
    await fetch(`/api/work-orders/${wo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    refresh()
  }

  const pmDone = async (pm: PMRow) => {
    await fetch(`/api/pm-schedules/${pm.id}/done`, { method: 'POST' })
    refresh()
  }

  const adjustStock = async (part: SparePartRow, delta: number) => {
    await fetch(`/api/spare-parts/${part.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: Math.max(0, part.qty + delta) }),
    })
    refresh()
  }

  const duePms = pms.filter((p) => p.due)

  return (
    <div className="ops-page">
      <OpsNav active="maintenance" />
      <header className="ops-header">
        <h1>Maintenance</h1>
        <div className="ops-actions">
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Close' : '+ Work order'}
          </button>
        </div>
      </header>

      {showForm && (
        <div className="order-form">
          <select value={woMachine} onChange={(e) => setWoMachine(e.target.value)}>
            <option value="">Machine…</option>
            {twin?.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="What needs doing?"
            value={woTitle}
            onChange={(e) => setWoTitle(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select value={woPriority} onChange={(e) => setWoPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button onClick={createWo} disabled={!woMachine || !woTitle.trim()}>
            Create
          </button>
        </div>
      )}

      {duePms.length > 0 && (
        <section className="dash-alert">
          <h2>Preventive maintenance due</h2>
          {duePms.map((pm) => (
            <p key={pm.id}>
              <strong>{pm.machine_name}</strong> — {pm.title} ({pm.due_reason})
            </p>
          ))}
        </section>
      )}

      <div className="dash-columns">
        <section className="dash-section">
          <h2>Work orders</h2>
          {workOrders.map((wo) => (
            <div key={wo.id} className={`wo-card ${wo.status}`}>
              <div className="wo-head">
                <strong>
                  {wo.id} · {wo.machine_name}
                </strong>
                <span className={`prio ${wo.priority}`}>{wo.priority}</span>
              </div>
              <p>{wo.title}</p>
              <div className="wo-foot">
                <span className={`wo-status ${wo.status}`}>
                  {wo.status.replace('_', ' ')}
                </span>
                {WO_NEXT[wo.status] && (
                  <button onClick={() => advanceWo(wo)}>
                    → {WO_NEXT[wo.status]?.replace('_', ' ')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {workOrders.length === 0 && <p>No work orders.</p>}
        </section>

        <div>
          <section className="dash-section" style={{ marginBottom: 20 }}>
            <h2>PM schedules</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Task</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pms.map((pm) => (
                  <tr key={pm.id}>
                    <td>{pm.machine_name}</td>
                    <td>
                      {pm.title}
                      <br />
                      <small style={{ color: '#94a3b8' }}>
                        {pm.interval_days ? `${pm.interval_days} d` : ''}
                        {pm.interval_days && pm.interval_runtime_h ? ' / ' : ''}
                        {pm.interval_runtime_h ? `${pm.interval_runtime_h} run-h` : ''} ·
                        run {pm.runtime_h_since.toFixed(0)} h since last
                      </small>
                    </td>
                    <td>
                      {pm.due ? (
                        <span className="late-chip">DUE</span>
                      ) : (
                        <span style={{ color: '#16a34a', fontSize: 11 }}>
                          ok{pm.next_due_date ? ` → ${pm.next_due_date}` : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="advance" onClick={() => pmDone(pm)}>
                        Done today
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dash-section">
            <h2>Spare parts</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Stock</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <tr key={part.id}>
                    <td>
                      {part.name}
                      <br />
                      <small style={{ color: '#94a3b8' }}>{part.sku}</small>
                    </td>
                    <td>
                      {part.low ? (
                        <span className="late-chip">
                          {part.qty}/{part.min_qty}
                        </span>
                      ) : (
                        `${part.qty}/${part.min_qty}`
                      )}
                    </td>
                    <td>{part.location}</td>
                    <td>
                      <button className="advance" onClick={() => adjustStock(part, -1)}>
                        −1
                      </button>{' '}
                      <button className="advance" onClick={() => adjustStock(part, 10)}>
                        +10
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  )
}
