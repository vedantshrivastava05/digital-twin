import { useEffect, useState } from 'react'
import { fetchTwin } from '../api'
import type { TwinDto } from '../types'
import { OpsNav } from './OpsNav'

interface RuleRow {
  id: string
  name: string
  machine_name: string
  semantic: string
  condition: string
  threshold: number | null
  state_value: string | null
  duration_s: number
  severity: string
  enabled: boolean
}

interface AlarmRow {
  id: string
  machine_name: string
  message: string
  severity: string
  raised_at: string
  acknowledged: boolean
}

export function AlarmsPage() {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [alarms, setAlarms] = useState<AlarmRow[]>([])
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [semantic, setSemantic] = useState('temperature')
  const [condition, setCondition] = useState('gt')
  const [threshold, setThreshold] = useState('75')
  const [duration, setDuration] = useState('10')
  const [severity, setSeverity] = useState('warning')

  const refresh = () => {
    fetch('/api/alert-rules').then((r) => r.json()).then(setRules)
    fetch('/api/alarms').then((r) => r.json()).then(setAlarms)
  }

  useEffect(() => {
    refresh()
    fetchTwin().then(setTwin)
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [])

  const createRule = async () => {
    if (!name.trim()) return
    await fetch('/api/alert-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        instance_id: instanceId || null,
        semantic,
        condition: semantic === 'state' ? 'eq' : condition,
        threshold: semantic === 'state' ? null : parseFloat(threshold),
        state_value: semantic === 'state' ? 'down' : null,
        duration_s: parseInt(duration || '0', 10),
        severity,
      }),
    })
    setShowForm(false)
    setName('')
    refresh()
  }

  const toggleRule = async (rule: RuleRow) => {
    await fetch(`/api/alert-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    refresh()
  }

  const ack = async (alarm: AlarmRow) => {
    await fetch(`/api/alarms/${alarm.id}/ack`, { method: 'POST' })
    refresh()
  }

  const active = alarms.filter((a) => !a.acknowledged)
  const history = alarms.filter((a) => a.acknowledged)

  return (
    <div className="ops-page">
      <OpsNav active="alarms" />
      <header className="ops-header">
        <h1>Alerts & alarms</h1>
        <div className="ops-actions">
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Close' : '+ Alert rule'}
          </button>
        </div>
      </header>

      {showForm && (
        <div className="order-form">
          <input
            type="text"
            placeholder="Rule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 160 }}
          />
          <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
            <option value="">All machines</option>
            {twin?.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select value={semantic} onChange={(e) => setSemantic(e.target.value)}>
            <option value="temperature">temperature</option>
            <option value="current">current</option>
            <option value="state">state = down</option>
          </select>
          {semantic !== 'state' && (
            <>
              <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
              </select>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                style={{ width: 80 }}
              />
            </>
          )}
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            for
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={{ width: 70 }}
            />
            s
          </label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
          <button onClick={createRule} disabled={!name.trim()}>
            Create
          </button>
        </div>
      )}

      <div className="dash-columns">
        <div>
          <section className="dash-alert" style={{ marginBottom: 16 }}>
            <h2>Active alarms ({active.length})</h2>
            {active.length === 0 && <p style={{ color: '#166534' }}>All clear.</p>}
            {active.map((alarm) => (
              <div key={alarm.id} className="alarm-row">
                <span className={`alarm-sev ${alarm.severity}`}>{alarm.severity}</span>
                <span className="alarm-msg">
                  {alarm.message}
                  <em>{new Date(alarm.raised_at).toLocaleString()}</em>
                </span>
                <button onClick={() => ack(alarm)}>Ack</button>
              </div>
            ))}
          </section>

          <section className="dash-section">
            <h2>Alarm history</h2>
            {history.slice(0, 15).map((alarm) => (
              <div key={alarm.id} className="alarm-row muted">
                <span className={`alarm-sev ${alarm.severity}`}>{alarm.severity}</span>
                <span className="alarm-msg">
                  {alarm.message}
                  <em>{new Date(alarm.raised_at).toLocaleString()}</em>
                </span>
              </div>
            ))}
            {history.length === 0 && <p>No acknowledged alarms yet.</p>}
          </section>
        </div>

        <section className="dash-section">
          <h2>Alert rules</h2>
          {rules.map((rule) => (
            <div key={rule.id} className="rule-row">
              <div>
                <strong>{rule.name}</strong>
                <em>
                  {rule.machine_name} ·{' '}
                  {rule.semantic === 'state'
                    ? `state = ${rule.state_value}`
                    : `${rule.semantic} ${rule.condition === 'gt' ? '>' : '<'} ${rule.threshold}`}
                  {rule.duration_s ? ` for ${rule.duration_s}s` : ''} · {rule.severity}
                </em>
              </div>
              <button
                className={`advance${rule.enabled ? '' : ' off'}`}
                onClick={() => toggleRule(rule)}
              >
                {rule.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
