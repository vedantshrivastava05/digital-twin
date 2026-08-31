import { useEffect, useMemo, useState } from 'react'
import { searchDocuments } from '../api'
import { STATUS_COLORS } from '../constants'
import { useFactoryStore, type LayerKey } from '../store'
import { CAMPUS } from '../scene/campusLayout'
import type { DocumentSearchHitDto, HierarchyNodeDto, TwinDto } from '../types'
import { IndustrialIcon } from './IndustrialIcon'

const LAYER_LABELS: Record<LayerKey, string> = {
  structure: 'Building structure',
  dressing: 'Fences & cabinets',
  robots: 'Robots',
  lines: 'Lines',
  machines: 'Shop machines',
  people: 'People & vehicles (RTLS)',
  tracks: 'Movement tracks (spaghetti)',
  heatmap: 'Density heatmap',
  labels: 'Name labels',
  orders: 'Order labels',
  annotations: 'Annotation pins',
}

const LEVEL_ICONS: Record<HierarchyNodeDto['level'], string> = {
  site: 'S',
  building: 'B',
  area: 'A',
  line: 'L',
  machine: 'M',
}

function TreeNode({
  twin,
  node,
  childrenByParent,
  depth,
}: {
  twin: TwinDto
  node: HierarchyNodeDto
  childrenByParent: Record<string, HierarchyNodeDto[]>
  depth: number
}) {
  const [open, setOpen] = useState(depth < 3)
  const select = useFactoryStore((s) => s.select)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const focusBuilding = useFactoryStore((s) => s.focusBuilding)
  const requestCameraPreset = useFactoryStore((s) => s.requestCameraPreset)

  const instance = twin.instances.find((i) => i.node_id === node.id)
  const status = useFactoryStore((s) =>
    instance ? s.machines[instance.id]?.status : undefined,
  )
  const children = childrenByParent[node.id] ?? []
  const isSelected = instance != null && selectedId === instance.id

  return (
    <div>
      <div
        className={`tree-row${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (instance) {
            select(instance.id)
            requestCameraPreset('focus', instance.id)
          }
          else {
            if (node.level === 'building') focusBuilding(node.id)
            setOpen(!open)
          }
        }}
      >
        {children.length > 0 ? (
          <button
            className="tree-caret"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(!open)
            }}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-caret-spacer" />
        )}
        <span className={`tree-icon lvl-${node.level}`}>{LEVEL_ICONS[node.level]}</span>
        <span className="tree-name">{node.name}</span>
        {status && (
          <span className="tree-status" style={{ background: STATUS_COLORS[status] }} />
        )}
      </div>
      {open &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            twin={twin}
            node={child}
            childrenByParent={childrenByParent}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

function MachineSearch({ twin }: { twin: TwinDto }) {
  const [query, setQuery] = useState('')
  const select = useFactoryStore((s) => s.select)
  const requestCameraPreset = useFactoryStore((s) => s.requestCameraPreset)
  const machines = useFactoryStore((s) => s.machines)

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return twin.instances
      .filter((instance) => {
        const asset = twin.assets.find((item) => item.id === instance.asset_id)
        return `${instance.name} ${instance.id} ${asset?.name ?? ''} ${asset?.category ?? ''}`
          .toLowerCase()
          .includes(normalized)
      })
      .slice(0, 10)
  }, [query, twin])

  return (
    <div className="sidebar-section industrial-machine-search">
      <h3>Machine search</h3>
      <label className="industrial-search-field">
        <IndustrialIcon name="search" size={15} />
        <input
          placeholder="Name, ID, or machine type…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear machine search">
            <IndustrialIcon name="close" size={13} />
          </button>
        )}
      </label>
      {query.trim() && (
        <div className="industrial-machine-results">
          {matches.map((instance) => {
            const asset = twin.assets.find((item) => item.id === instance.asset_id)
            const status = machines[instance.id]?.status
            return (
              <button
                key={instance.id}
                onClick={() => {
                  select(instance.id)
                  requestCameraPreset('focus', instance.id)
                  setQuery('')
                }}
              >
                <span className="machine-result-icon"><IndustrialIcon name="box" size={15} /></span>
                <p><strong>{instance.name}</strong><small>{asset?.name ?? 'Machine'} · {instance.id}</small></p>
                {status && <i style={{ background: STATUS_COLORS[status] }} />}
              </button>
            )
          })}
          {matches.length === 0 && <p className="machine-search-empty">No matching machines</p>}
        </div>
      )}
    </div>
  )
}

function DocSearch() {
  const twin = useFactoryStore((s) => s.twin)
  const select = useFactoryStore((s) => s.select)
  const setInfoTab = useFactoryStore((s) => s.setInfoTab)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<DocumentSearchHitDto[]>([])
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (!twin || query.trim().length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    const timer = setTimeout(async () => {
      setHits(await searchDocuments(twin.site.id, query))
      setSearched(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, twin])

  return (
    <div className="sidebar-section">
      <h3>Search documents</h3>
      <input
        className="text-input"
        placeholder="Search manuals, notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searched && hits.length === 0 && <p className="search-empty">No matches</p>}
      {hits.map((hit) => (
        <div
          key={hit.document.id}
          className="search-hit"
          onClick={() => {
            select(hit.instance_id)
            setInfoTab('documents')
          }}
        >
          <strong>{hit.document.filename}</strong>
          <span>{hit.instance_name}</span>
          {hit.snippet && <em>…{hit.snippet}…</em>}
        </div>
      ))}
    </div>
  )
}

export function Sidebar() {
  const twin = useFactoryStore((s) => s.twin)
  const layers = useFactoryStore((s) => s.layers)
  const toggleLayer = useFactoryStore((s) => s.toggleLayer)
  const walkMode = useFactoryStore((s) => s.walkMode)
  const setWalkMode = useFactoryStore((s) => s.setWalkMode)
  const pinMode = useFactoryStore((s) => s.pinMode)
  const setPinMode = useFactoryStore((s) => s.setPinMode)
  const editMode = useFactoryStore((s) => s.editMode)
  const setEditMode = useFactoryStore((s) => s.setEditMode)
  const focusBuilding = useFactoryStore((s) => s.focusBuilding)
  const focusedBuildingId = useFactoryStore((s) => s.focusedBuildingId)

  const { roots, childrenByParent } = useMemo(() => {
    const byParent: Record<string, HierarchyNodeDto[]> = {}
    const rootNodes: HierarchyNodeDto[] = []
    for (const node of twin?.nodes ?? []) {
      if (node.parent_id == null) {
        rootNodes.push(node)
      } else {
        ;(byParent[node.parent_id] ??= []).push(node)
      }
    }
    return { roots: rootNodes, childrenByParent: byParent }
  }, [twin])

  if (!twin) return null

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>AI Factory</h1>
        <span>Twin Builder</span>
      </div>

      <div className="sidebar-section">
        <h3>Plant view</h3>
        <button
          className={`tool-btn${focusedBuildingId === null ? ' active' : ''}`}
          onClick={() => focusBuilding(null)}
        >
          Whole campus
        </button>
        {CAMPUS.map((b) => (
          <button
            key={b.id}
            className={`tool-btn${focusedBuildingId === b.id ? ' active' : ''}`}
            onClick={() => focusBuilding(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      <MachineSearch twin={twin} />

      <div className="sidebar-section">
        <h3>Plant hierarchy</h3>
        <div className="tree">
          {roots.map((node) => (
            <TreeNode
              key={node.id}
              twin={twin}
              node={node}
              childrenByParent={childrenByParent}
              depth={0}
            />
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Layers</h3>
        {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
          <label key={key} className="layer-row">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => toggleLayer(key)}
            />
            {LAYER_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="sidebar-section">
        <h3>Tools</h3>
        <button
          className={`tool-btn${walkMode ? ' active' : ''}`}
          onClick={() => setWalkMode(!walkMode)}
        >
          {walkMode ? 'Exit walk mode (Esc)' : 'Walk mode (WASD)'}
        </button>
        <button
          className={`tool-btn${pinMode ? ' active' : ''}`}
          onClick={() => setPinMode(!pinMode)}
        >
          {pinMode ? 'Click scene to drop pin…' : 'Add annotation pin'}
        </button>
        <button
          className={`tool-btn${editMode ? ' active' : ''}`}
          onClick={() => setEditMode(!editMode)}
        >
          {editMode ? 'Exit builder mode' : 'Builder mode (edit twin)'}
        </button>
        <a className="tool-btn link-btn" href="/labels" target="_blank" rel="noreferrer">
          QR label sheet ↗
        </a>
      </div>

      <div className="sidebar-section">
        <h3>Ops screens</h3>
        <a className="tool-btn link-btn" href="/ops" target="_blank" rel="noreferrer">
          Order board ↗
        </a>
        <a className="tool-btn link-btn" href="/operator" target="_blank" rel="noreferrer">
          Operator tablet ↗
        </a>
        <a className="tool-btn link-btn" href="/dashboard" target="_blank" rel="noreferrer">
          Owner dashboard ↗
        </a>
        <a className="tool-btn link-btn" href="/report" target="_blank" rel="noreferrer">
          Morning report ↗
        </a>
      </div>

      <DocSearch />
    </aside>
  )
}
