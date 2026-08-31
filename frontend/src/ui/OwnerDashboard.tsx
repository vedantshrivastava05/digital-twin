import { useEffect, useState } from 'react'
import { fetchDashboard } from '../api'
import type { DashboardDto } from '../types'
import { OpsNav } from './OpsNav'

function formatSince(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

/** Owner view: today at a glance (PRD 8.9) */
export function OwnerDashboard() {
  const [data, setData] = useState<DashboardDto | null>(null)

  useEffect(() => {
    fetchDashboard().then(setData)
    const id = setInterval(() => fetchDashboard().then(setData), 10000)
    return () => clearInterval(id)
  }, [])

  if (!data) return <div className="ops-page">Loading…</div>

  const maxTrend = Math.max(1, ...data.trend.map((t) => t.good))
  const maxPareto = Math.max(1, ...data.pareto.map((p) => p.minutes))

  return (
    <div className="ops-page">
      <OpsNav active="dashboard" />
      <header className="ops-header">
        <h1>Owner dashboard — {data.date}</h1>
      </header>

      <div className="dash-cards">
        <div className="dash-card">
          <span>Output today</span>
          <strong>{data.good_today.toLocaleString()}</strong>
        </div>
        <div className="dash-card">
          <span>Rejects today</span>
          <strong>{data.reject_today.toLocaleString()}</strong>
        </div>
        <div className={`dash-card${data.machines_down.length ? ' bad' : ' good'}`}>
          <span>Machines down</span>
          <strong>
            {data.machines_down.length} / {data.machines_total}
          </strong>
        </div>
        <div className={`dash-card${data.late_orders.length ? ' bad' : ' good'}`}>
          <span>Late orders</span>
          <strong>{data.late_orders.length}</strong>
        </div>
        <div className="dash-card">
          <span>Orders running</span>
          <strong>{data.order_counts.running ?? 0}</strong>
        </div>
      </div>

      {data.machines_down.length > 0 && (
        <section className="dash-alert">
          <h2>Down now</h2>
          {data.machines_down.map((m) => (
            <p key={m.instance_id}>
              <strong>{m.name}</strong> — {m.reason ?? 'unknown'} · down for{' '}
              {formatSince(m.since)}
            </p>
          ))}
        </section>
      )}

      {data.late_orders.length > 0 && (
        <section className="dash-alert">
          <h2>Late orders</h2>
          {data.late_orders.map((o) => (
            <p key={o.id}>
              <strong>{o.id}</strong> — {o.product_name} · {o.produced}/{o.qty} · was
              due {o.due_date}
            </p>
          ))}
        </section>
      )}

      <div className="dash-columns">
        <section className="dash-section">
          <h2>Output — last 7 days</h2>
          <div className="trend-chart">
            {data.trend.map((t) => (
              <div key={t.date} className="trend-col">
                <div
                  className="trend-bar"
                  style={{ height: `${(t.good / maxTrend) * 100}%` }}
                  title={`${t.good.toLocaleString()} good`}
                />
                <span>{t.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-section">
          <h2>Downtime Pareto — 7 days</h2>
          {data.pareto.map((p) => (
            <div key={p.reason_code} className="pareto-row light">
              <span className="pareto-label">{p.reason}</span>
              <div className="pareto-bar-track">
                <div
                  className="pareto-bar"
                  style={{ width: `${(p.minutes / maxPareto) * 100}%` }}
                />
              </div>
              <span className="pareto-value">{Math.round(p.minutes)} min</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
