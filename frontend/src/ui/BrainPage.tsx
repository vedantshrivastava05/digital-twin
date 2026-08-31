import { useEffect, useState } from 'react'
import { OpsNav } from './OpsNav'

interface HealthFactor {
  label: string
  delta: number
}

interface HealthRow {
  instance_id: string
  name: string
  category: string
  score: number
  grade: 'healthy' | 'watch' | 'at-risk'
  status: string
  temperature: number | null
  factors: HealthFactor[]
}

interface RiskRow extends HealthRow {
  risk: number
  top_factor: string
}

interface AnomalyEvent {
  id: string
  machine_name: string
  semantic: string
  value: number
  zscore: number
  baseline: number
  ts: string
}

interface Suspect {
  component: string
  confidence: number
  spare_sku: string | null
  spare_name: string | null
  in_stock: number | null
  stocked: boolean
  location: string | null
}

interface Diagnosis {
  instance_id: string
  machine_name: string
  symptom: string
  suspects: Suspect[]
}

interface AccuracyDto {
  anomaly_events: number
  alarms_raised: number
  predictive_work_orders: number
  confirmed_done: number
  open: number
  hit_rate: number | null
  recent: { id: string; title: string; status: string; created_at: string }[]
}

const GRADE_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  watch: '#f59e0b',
  'at-risk': '#ef4444',
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444'
  return (
    <div className="score-bar">
      <div className="score-fill" style={{ width: `${score}%`, background: color }} />
      <span>{score}</span>
    </div>
  )
}

function DiagnosisModal({
  instanceId,
  machineName,
  onClose,
}: {
  instanceId: string
  machineName: string
  onClose: () => void
}) {
  const [symptoms, setSymptoms] = useState<{ id: string; symptom: string }[]>([])
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [createdWo, setCreatedWo] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/brain/symptoms/${instanceId}`)
      .then((r) => r.json())
      .then(setSymptoms)
  }, [instanceId])

  const diagnose = async (symptomId: string) => {
    setCreatedWo(null)
    const res = await fetch('/api/brain/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: instanceId, symptom_id: symptomId }),
    })
    setDiagnosis(await res.json())
  }

  const createWorkOrder = async (suspect: Suspect) => {
    if (!diagnosis) return
    const res = await fetch('/api/brain/diagnose/work-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: instanceId,
        symptom: diagnosis.symptom,
        component: suspect.component,
        confidence: suspect.confidence,
        spare_sku: suspect.spare_sku,
      }),
    })
    const data = await res.json()
    setCreatedWo(data.id)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Diagnose — {machineName}</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="dim">What is the symptom?</p>
        <div className="symptom-row">
          {symptoms.map((s) => (
            <button
              key={s.id}
              className={`symptom-btn${diagnosis?.symptom === s.symptom ? ' active' : ''}`}
              onClick={() => diagnose(s.id)}
            >
              {s.symptom}
            </button>
          ))}
        </div>

        {diagnosis && (
          <div className="suspects">
            <h4>Ranked suspects</h4>
            {diagnosis.suspects.map((suspect) => (
              <div key={suspect.component} className="suspect-card">
                <div className="suspect-main">
                  <strong>{suspect.component}</strong>
                  <span className="confidence">{Math.round(suspect.confidence * 100)}%</span>
                </div>
                <div className="suspect-meta">
                  {suspect.spare_sku ? (
                    suspect.stocked ? (
                      <span className="stock ok">
                        {suspect.spare_name} — {suspect.in_stock} in stock ({suspect.location})
                      </span>
                    ) : (
                      <span className="stock low">
                        Spare {suspect.spare_sku} not stocked — order required
                      </span>
                    )
                  ) : (
                    <span className="stock">No spare part needed</span>
                  )}
                  <button className="advance" onClick={() => createWorkOrder(suspect)}>
                    Create work order
                  </button>
                </div>
              </div>
            ))}
            {createdWo && (
              <p className="wo-created">
                Work order <strong>{createdWo}</strong> created — see the Maintenance page.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function BrainPage() {
  const [health, setHealth] = useState<HealthRow[]>([])
  const [risk, setRisk] = useState<RiskRow[]>([])
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([])
  const [accuracy, setAccuracy] = useState<AccuracyDto | null>(null)
  const [diagTarget, setDiagTarget] = useState<{ id: string; name: string } | null>(null)

  const refresh = () => {
    fetch('/api/brain/health').then((r) => r.json()).then(setHealth)
    fetch('/api/brain/risk-queue').then((r) => r.json()).then(setRisk)
    fetch('/api/brain/anomalies')
      .then((r) => r.json())
      .then((d) => setAnomalies(d.events))
    fetch('/api/brain/accuracy').then((r) => r.json()).then(setAccuracy)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 6000)
    return () => clearInterval(id)
  }, [])

  const healthy = health.filter((h) => h.grade === 'healthy').length
  const watch = health.filter((h) => h.grade === 'watch').length
  const atRisk = health.filter((h) => h.grade === 'at-risk').length

  return (
    <div className="ops-page">
      <OpsNav active="brain" />
      <header className="ops-header">
        <h1>Factory Brain</h1>
        <p className="ops-note">
          Condition rules + EWMA anomaly detection on live telemetry
        </p>
      </header>

      <div className="dash-cards">
        <div className="dash-card">
          <span className="dash-label">Healthy</span>
          <span className="dash-value" style={{ color: '#16a34a' }}>
            {healthy}
          </span>
        </div>
        <div className="dash-card">
          <span className="dash-label">Watch</span>
          <span className="dash-value" style={{ color: '#d97706' }}>
            {watch}
          </span>
        </div>
        <div className="dash-card">
          <span className="dash-label">At risk</span>
          <span className="dash-value" style={{ color: '#dc2626' }}>
            {atRisk}
          </span>
        </div>
        <div className="dash-card">
          <span className="dash-label">Prediction hit rate</span>
          <span className="dash-value">
            {accuracy?.hit_rate != null ? `${Math.round(accuracy.hit_rate * 100)}%` : '—'}
          </span>
        </div>
      </div>

      <div className="dash-columns">
        <div>
          <section className="dash-section" style={{ marginBottom: 16 }}>
            <h2>Maintenance risk queue</h2>
            {risk.length === 0 && <p>Nothing needs attention right now.</p>}
            {risk.map((row) => (
              <div key={row.instance_id} className="risk-row">
                <div className="risk-score" style={{ background: GRADE_COLORS[row.grade] }}>
                  {row.score}
                </div>
                <div className="risk-main">
                  <strong>{row.name}</strong>
                  <em>{row.top_factor}</em>
                </div>
                <button
                  className="advance"
                  onClick={() => setDiagTarget({ id: row.instance_id, name: row.name })}
                >
                  Diagnose
                </button>
              </div>
            ))}
          </section>

          <section className="dash-section">
            <h2>Recent anomalies (EWMA z-score)</h2>
            {anomalies.length === 0 && <p>No anomalies detected yet.</p>}
            {anomalies.slice(0, 10).map((event) => (
              <div key={event.id} className="anomaly-row">
                <span className="anomaly-z">{event.zscore > 0 ? '+' : ''}{event.zscore}σ</span>
                <span className="alarm-msg">
                  {event.machine_name} — {event.semantic} {event.value.toFixed(1)} vs baseline{' '}
                  {event.baseline.toFixed(1)}
                  <em>{new Date(event.ts).toLocaleTimeString()}</em>
                </span>
              </div>
            ))}
          </section>
        </div>

        <div>
          <section className="dash-section" style={{ marginBottom: 16 }}>
            <h2>Machine health</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Health</th>
                  <th>Temp</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {health.map((row) => (
                  <tr key={row.instance_id}>
                    <td>
                      {row.name}
                      {row.factors.length > 0 && (
                        <em className="health-factors">
                          {row.factors.map((f) => f.label).join(' · ')}
                        </em>
                      )}
                    </td>
                    <td style={{ width: 130 }}>
                      <ScoreBar score={row.score} />
                    </td>
                    <td>{row.temperature != null ? `${row.temperature} °C` : '—'}</td>
                    <td>
                      <button
                        className="mini-btn"
                        onClick={() => setDiagTarget({ id: row.instance_id, name: row.name })}
                      >
                        Diagnose
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dash-section">
            <h2>Predicted vs actual</h2>
            {accuracy && (
              <>
                <p className="dim">
                  {accuracy.anomaly_events} anomaly events · {accuracy.alarms_raised} alarms ·{' '}
                  {accuracy.predictive_work_orders} predictive work orders (
                  {accuracy.confirmed_done} confirmed done, {accuracy.open} open)
                </p>
                {accuracy.recent.map((wo) => (
                  <div key={wo.id} className="anomaly-row">
                    <span className={`wo-status ${wo.status}`}>{wo.status}</span>
                    <span className="alarm-msg">
                      {wo.title}
                      <em>{new Date(wo.created_at).toLocaleString()}</em>
                    </span>
                  </div>
                ))}
                {accuracy.recent.length === 0 && (
                  <p>No predictive work orders yet — run a diagnosis to create one.</p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {diagTarget && (
        <DiagnosisModal
          instanceId={diagTarget.id}
          machineName={diagTarget.name}
          onClose={() => setDiagTarget(null)}
        />
      )}
    </div>
  )
}
