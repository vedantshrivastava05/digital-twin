import { useEffect, useState } from 'react'
import { fetchTwin } from '../api'
import type { TwinDto } from '../types'
import { OpsNav } from './OpsNav'

interface TagRow {
  id: string
  raw_tag: string
  instance_id: string | null
  machine_name: string | null
  semantic: string | null
  unit: string
  mapped: boolean
}

const SEMANTICS = ['state', 'temperature', 'current', 'cycle_count', 'energy']

export function TagMapperPage() {
  const [tags, setTags] = useState<TagRow[]>([])
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [draft, setDraft] = useState<Record<string, { instance_id: string; semantic: string }>>({})

  const refresh = () => fetch('/api/tags').then((r) => r.json()).then(setTags)

  useEffect(() => {
    refresh()
    fetchTwin().then(setTwin)
  }, [])

  const bind = async (tag: TagRow) => {
    const d = draft[tag.id]
    if (!d?.instance_id || !d?.semantic) return
    await fetch(`/api/tags/${tag.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: d.instance_id, semantic: d.semantic }),
    })
    refresh()
  }

  const unmapped = tags.filter((t) => !t.mapped)
  const mapped = tags.filter((t) => t.mapped)

  return (
    <div className="ops-page">
      <OpsNav active="tags" />
      <header className="ops-header">
        <h1>Tag mapper</h1>
        <p className="ops-note">
          {mapped.length} bound · {unmapped.length} unbound raw tags
        </p>
      </header>

      {unmapped.length > 0 && (
        <section className="dash-section" style={{ marginBottom: 20 }}>
          <h2>Unbound tags — bind to an asset</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Raw tag</th>
                <th>Machine</th>
                <th>Semantic</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unmapped.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <code>{tag.raw_tag}</code>
                  </td>
                  <td>
                    <select
                      value={draft[tag.id]?.instance_id ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [tag.id]: {
                            semantic: draft[tag.id]?.semantic ?? '',
                            instance_id: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Select machine…</option>
                      {twin?.instances.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={draft[tag.id]?.semantic ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [tag.id]: {
                            instance_id: draft[tag.id]?.instance_id ?? '',
                            semantic: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Semantic…</option>
                      {SEMANTICS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="advance"
                      onClick={() => bind(tag)}
                      disabled={!draft[tag.id]?.instance_id || !draft[tag.id]?.semantic}
                    >
                      Bind
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="dash-section">
        <h2>Bound tags</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Raw tag</th>
              <th>Machine</th>
              <th>Semantic</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {mapped.map((tag) => (
              <tr key={tag.id}>
                <td>
                  <code>{tag.raw_tag}</code>
                </td>
                <td>{tag.machine_name}</td>
                <td>{tag.semantic}</td>
                <td>{tag.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
