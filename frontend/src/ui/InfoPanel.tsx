import { useEffect, useRef, useState } from 'react'
import {
  apiCreateComponent,
  apiDeleteComponent,
  apiDeleteDocument,
  apiLogProduction,
  apiUploadDocument,
  fetchComponents,
  fetchDocuments,
  fetchDowntime,
  fetchOee,
  fetchOeeSeries,
  fetchReasonCodes,
} from '../api'
import { useFactoryStore } from '../store'
import { STATUS_COLORS, STATUS_LABELS } from '../constants'
import { LiveStrip } from './LiveStrip'
import type {
  ComponentDto,
  DocumentDto,
  DowntimeEntryDto,
  OeeDto,
  OeePointDto,
  ReasonCodeDto,
} from '../types'

type OeeKey = 'oee' | 'availability' | 'performance' | 'quality'

/** 24 h OEE trend (OEE + availability/performance/quality) as a compact SVG. */
function OeeTrend({ instanceId }: { instanceId: string }) {
  const [pts, setPts] = useState<OeePointDto[]>([])
  useEffect(() => {
    let alive = true
    setPts([])
    fetchOeeSeries(instanceId, 24, 24)
      .then((d) => alive && setPts(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [instanceId])

  if (pts.length < 2) return null
  const W = 100
  const H = 40
  const poly = (key: OeeKey) =>
    pts
      .map((p, i) => {
        const x = (i / (pts.length - 1)) * W
        const y = H - p[key] * H
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  const area = `0,${H} ${poly('oee')} ${W},${H}`

  return (
    <div className="oee-trend">
      <h4>OEE trend · 24 h</h4>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <polygon points={area} fill="rgba(56,189,248,0.18)" />
        <polyline points={poly('availability')} fill="none" stroke="#22c55e" strokeWidth="0.8" opacity="0.7" />
        <polyline points={poly('performance')} fill="none" stroke="#f59e0b" strokeWidth="0.8" opacity="0.7" />
        <polyline points={poly('quality')} fill="none" stroke="#a78bfa" strokeWidth="0.8" opacity="0.7" />
        <polyline points={poly('oee')} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
      </svg>
      <div className="trend-legend">
        <span><i style={{ background: '#38bdf8' }} />OEE</span>
        <span><i style={{ background: '#22c55e' }} />Avail</span>
        <span><i style={{ background: '#f59e0b' }} />Perf</span>
        <span><i style={{ background: '#a78bfa' }} />Qual</span>
      </div>
    </div>
  )
}

function formatDuration(sinceMs: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ${sec % 60}s`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

let reasonCodesCache: ReasonCodeDto[] | null = null

function OverviewTab({ instanceId }: { instanceId: string }) {
  const runtime = useFactoryStore((s) => s.machines[instanceId])
  const setStatus = useFactoryStore((s) => s.setStatus)
  const [oee, setOee] = useState<OeeDto | null>(null)
  const [downtime, setDowntime] = useState<DowntimeEntryDto[]>([])
  const [reasonCodes, setReasonCodes] = useState<ReasonCodeDto[]>(reasonCodesCache ?? [])
  const [pickingReason, setPickingReason] = useState(false)
  const [good, setGood] = useState('')
  const [reject, setReject] = useState('')
  const [logged, setLogged] = useState(false)

  const refresh = () => {
    fetchOee(instanceId).then(setOee)
    fetchDowntime(instanceId).then(setDowntime)
  }

  useEffect(() => {
    setOee(null)
    setPickingReason(false)
    fetchOee(instanceId).then(setOee)
    fetchDowntime(instanceId).then(setDowntime)
    if (!reasonCodesCache) {
      fetchReasonCodes().then((codes) => {
        reasonCodesCache = codes
        setReasonCodes(codes)
      })
    }
  }, [instanceId])

  if (!runtime) return null
  const status = runtime.status

  const markDown = async (code: string) => {
    setPickingReason(false)
    await setStatus(instanceId, 'down', code)
    refresh()
  }

  const backTo = async (next: 'running' | 'idle') => {
    await setStatus(instanceId, next)
    refresh()
  }

  const logProduction = async () => {
    const g = parseInt(good || '0', 10)
    const r = parseInt(reject || '0', 10)
    if (g <= 0 && r <= 0) return
    await apiLogProduction(instanceId, g, r)
    setGood('')
    setReject('')
    setLogged(true)
    setTimeout(() => setLogged(false), 1500)
    refresh()
  }

  return (
    <>
      <div className="status-row">
        <span className="badge" style={{ background: STATUS_COLORS[status] }}>
          {STATUS_LABELS[status]}
          {runtime.reasonCode ? ` · ${runtime.reasonCode}` : ''}
        </span>
        <span className="since">for {formatDuration(runtime.sinceMs)}</span>
      </div>

      {/* Status controls: tap > Down > reason in seconds */}
      {!pickingReason ? (
        <div className="btn-row status-controls">
          {status !== 'down' && (
            <button className="tool-btn danger" onClick={() => setPickingReason(true)}>
              Report downtime
            </button>
          )}
          {status !== 'running' && (
            <button className="tool-btn" onClick={() => backTo('running')}>
              Set running
            </button>
          )}
          {status === 'running' && (
            <button className="tool-btn" onClick={() => backTo('idle')}>
              Set idle
            </button>
          )}
        </div>
      ) : (
        <div className="reason-picker">
          <p className="dim">Why is it down?</p>
          {reasonCodes.map((rc) => (
            <button key={rc.code} className="tool-btn" onClick={() => markDown(rc.code)}>
              {rc.label}
            </button>
          ))}
          <button className="tool-btn" onClick={() => setPickingReason(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="oee-block">
        <div className="oee-value">{oee ? `${(oee.oee * 100).toFixed(1)}%` : '…'}</div>
        <div className="oee-label">OEE · last 24 h · from logged data</div>
      </div>

      {oee && (
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Availability</span>
            <span className="stat-value">{(oee.availability * 100).toFixed(1)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Performance</span>
            <span className="stat-value">{(oee.performance * 100).toFixed(1)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Quality</span>
            <span className="stat-value">{(oee.quality * 100).toFixed(1)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Good (24h)</span>
            <span className="stat-value">{oee.good.toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Rejects</span>
            <span className="stat-value">{oee.reject.toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Downtime</span>
            <span className="stat-value">{oee.downtime_minutes.toFixed(0)} min</span>
          </div>
        </div>
      )}

      <OeeTrend instanceId={instanceId} />

      <LiveStrip instanceId={instanceId} />

      <div className="prod-form">
        <h4>Log production (this shift)</h4>
        <div className="btn-row">
          <input
            className="text-input"
            type="number"
            min="0"
            placeholder="Good"
            value={good}
            onChange={(e) => setGood(e.target.value)}
          />
          <input
            className="text-input"
            type="number"
            min="0"
            placeholder="Reject"
            value={reject}
            onChange={(e) => setReject(e.target.value)}
          />
          <button className="tool-btn" onClick={logProduction}>
            {logged ? 'Logged ✓' : 'Log'}
          </button>
        </div>
      </div>

      {downtime.length > 0 && (
        <div className="downtime-list">
          <h4>Recent downtime</h4>
          {downtime.slice(0, 4).map((entry) => (
            <div key={entry.id} className="row-item">
              <span>
                {entry.reason_code}
                <em>
                  {new Date(entry.started_at).toLocaleString()} ·{' '}
                  {entry.ended_at
                    ? `${Math.round(
                        (new Date(entry.ended_at).getTime() -
                          new Date(entry.started_at).getTime()) /
                          60000,
                      )} min`
                    : 'ongoing'}
                </em>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function DocumentsTab({ instanceId }: { instanceId: string }) {
  const [docs, setDocs] = useState<DocumentDto[]>([])
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => fetchDocuments(instanceId).then(setDocs)

  useEffect(() => {
    fetchDocuments(instanceId).then(setDocs)
  }, [instanceId])

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        await apiUploadDocument(instanceId, file)
      }
      await refresh()
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="doc-tab">
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => onUpload(e.target.files)}
      />
      <button
        className="tool-btn"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        {busy ? 'Uploading…' : 'Upload document'}
      </button>
      {docs.length === 0 && <p className="dim">No documents yet — manuals, drawings, photos…</p>}
      {docs.map((doc) => (
        <div key={doc.id} className="row-item">
          <span>
            <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
              {doc.filename}
            </a>
            <em>
              {formatSize(doc.size)} · {new Date(doc.uploaded_at).toLocaleDateString()}
            </em>
          </span>
          <button
            className="danger"
            onClick={async () => {
              await apiDeleteDocument(doc.id)
              refresh()
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}

function ComponentsTab({ instanceId }: { instanceId: string }) {
  const [components, setComponents] = useState<ComponentDto[]>([])
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('')

  const refresh = () => fetchComponents(instanceId).then(setComponents)

  useEffect(() => {
    fetchComponents(instanceId).then(setComponents)
    setParentId('')
  }, [instanceId])

  const add = async () => {
    if (!name.trim()) return
    await apiCreateComponent(instanceId, {
      name: name.trim(),
      parent_id: parentId || null,
    })
    setName('')
    refresh()
  }

  const renderTree = (parent: string | null, depth: number) =>
    components
      .filter((c) => c.parent_id === parent)
      .map((c) => (
        <div key={c.id}>
          <div className="row-item" style={{ paddingLeft: `${4 + depth * 16}px` }}>
            <span>
              {c.name}
              {c.note && <em>{c.note}</em>}
            </span>
            <button
              className="danger"
              onClick={async () => {
                await apiDeleteComponent(c.id)
                refresh()
              }}
            >
              ×
            </button>
          </div>
          {renderTree(c.id, depth + 1)}
        </div>
      ))

  return (
    <div className="doc-tab">
      {components.length === 0 && (
        <p className="dim">No components documented for this machine yet.</p>
      )}
      {renderTree(null, 0)}
      <div className="component-add">
        <input
          className="text-input"
          placeholder="New component name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <select
          className="text-input"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">Top level</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              under {c.name}
            </option>
          ))}
        </select>
        <button className="tool-btn" onClick={add} disabled={!name.trim()}>
          Add component
        </button>
      </div>
    </div>
  )
}

export function InfoPanel() {
  const twin = useFactoryStore((s) => s.twin)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const select = useFactoryStore((s) => s.select)
  const tab = useFactoryStore((s) => s.infoTab)
  const setTab = useFactoryStore((s) => s.setInfoTab)

  if (!twin || !selectedId) return null
  const instance = twin.instances.find((i) => i.id === selectedId)
  if (!instance) return null
  const asset = twin.assets.find((a) => a.id === instance.asset_id)
  const node = twin.nodes.find((n) => n.id === instance.node_id)
  const line = node && twin.nodes.find((n) => n.id === node.parent_id && n.level === 'line')

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{instance.name}</h2>
          <p className="panel-type">
            {asset?.name}
            {line ? ` · ${line.name}` : ''}
          </p>
        </div>
        <button className="close" onClick={() => select(null)} aria-label="Close">
          ×
        </button>
      </div>

      <div className="machine-view-summary">
        <div><span>Machine ID</span><code title={instance.id}>{instance.id}</code></div>
        <div><span>Position</span><strong>{instance.x.toFixed(1)}, {instance.y.toFixed(1)}, {instance.z.toFixed(1)} m</strong></div>
        <div><span>Rotation</span><strong>{Math.round((instance.rotation_y * 180) / Math.PI)}°</strong></div>
      </div>

      <div className="tabs">
        {(['overview', 'documents', 'components'] as const).map((key) => (
          <button
            key={key}
            className={`tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key === 'overview' ? 'Overview' : key === 'documents' ? 'Docs' : 'Parts'}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab instanceId={instance.id} />}
      {tab === 'documents' && <DocumentsTab instanceId={instance.id} />}
      {tab === 'components' && <ComponentsTab instanceId={instance.id} />}
    </div>
  )
}
