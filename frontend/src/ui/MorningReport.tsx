import { useEffect, useState } from 'react'
import { fetchMorningReport } from '../api'
import type { MorningReportDto } from '../types'

/** Printable "yesterday at a glance" page (PRD 7.11 morning report) */
export function MorningReport() {
  const [report, setReport] = useState<MorningReportDto | null>(null)
  const [date, setDate] = useState('')

  useEffect(() => {
    fetchMorningReport(date || undefined).then(setReport)
  }, [date])

  if (!report) return <div className="label-page">Loading report…</div>

  const maxReason = Math.max(1, ...report.top_reasons.map((r) => r.minutes))

  return (
    <div className="label-page report-page">
      <header className="label-header">
        <div>
          <h1>Morning report — {report.date}</h1>
          <p>Output, OEE and downtime from logged records.</p>
        </div>
        <div className="report-controls">
          <input
            type="date"
            value={date || report.date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button onClick={() => window.print()}>Print</button>
        </div>
      </header>

      <div className="report-cards">
        <div className="report-card">
          <span>Total output</span>
          <strong>{report.total_good.toLocaleString()}</strong>
        </div>
        <div className="report-card">
          <span>Rejects</span>
          <strong>{report.total_reject.toLocaleString()}</strong>
        </div>
        <div className="report-card">
          <span>Downtime</span>
          <strong>{Math.round(report.downtime_minutes)} min</strong>
        </div>
        <div className="report-card">
          <span>Plant availability</span>
          <strong>{(report.plant_availability * 100).toFixed(1)}%</strong>
        </div>
        <div className="report-card">
          <span>Plant quality</span>
          <strong>{(report.plant_quality * 100).toFixed(1)}%</strong>
        </div>
      </div>

      {report.machines_down_now.length > 0 && (
        <section className="report-section alert">
          <h2>Down right now</h2>
          {report.machines_down_now.map((m) => (
            <p key={m.instance_id}>
              <strong>{m.name}</strong> — {m.reason ?? 'unknown reason'} since{' '}
              {new Date(m.since).toLocaleTimeString()}
            </p>
          ))}
        </section>
      )}

      <div className="report-columns">
        <section className="report-section">
          <h2>Top downtime reasons</h2>
          {report.top_reasons.length === 0 && <p>No downtime recorded.</p>}
          {report.top_reasons.map((reason) => (
            <div key={reason.reason_code} className="pareto-row">
              <span className="pareto-label">{reason.reason}</span>
              <div className="pareto-bar-track">
                <div
                  className="pareto-bar"
                  style={{ width: `${(reason.minutes / maxReason) * 100}%` }}
                />
              </div>
              <span className="pareto-value">{Math.round(reason.minutes)} min</span>
            </div>
          ))}
        </section>

        <section className="report-section">
          <h2>Output by machine</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Good</th>
                <th>Reject</th>
              </tr>
            </thead>
            <tbody>
              {report.machines.map((m) => (
                <tr key={m.instance_id}>
                  <td>{m.name}</td>
                  <td>{m.good.toLocaleString()}</td>
                  <td>{m.reject.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
