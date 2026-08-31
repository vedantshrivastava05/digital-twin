import { useEffect, useMemo, useState } from 'react'
import { STATUS_COLORS, STATUS_LABELS } from '../constants'
import { useFactoryStore } from '../store'
import type { MachineStatus } from '../types'
import { IndustrialIcon } from './IndustrialIcon'

type InspectorTab = 'properties' | 'library' | 'versions'

const STATUSES: MachineStatus[] = ['running', 'idle', 'warning', 'down']
const PLACEABLE_EXCLUDE = new Set(['bodyline', 'trimline'])

function numberDraft(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function machinePath(instanceId: string): string[] {
  const twin = useFactoryStore.getState().twin
  if (!twin) return []
  const instance = twin.instances.find((item) => item.id === instanceId)
  let node = twin.nodes.find((item) => item.id === instance?.node_id)
  const path: string[] = []
  while (node) {
    path.unshift(node.name)
    node = twin.nodes.find((item) => item.id === node?.parent_id)
  }
  return path
}

export function MachinePropertiesPanel() {
  const twin = useFactoryStore((s) => s.twin)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const select = useFactoryStore((s) => s.select)
  const machines = useFactoryStore((s) => s.machines)
  const renameInstance = useFactoryStore((s) => s.renameInstance)
  const setStatus = useFactoryStore((s) => s.setStatus)
  const updateInstanceTransform = useFactoryStore((s) => s.updateInstanceTransform)
  const changeInstanceType = useFactoryStore((s) => s.changeInstanceType)
  const duplicateInstance = useFactoryStore((s) => s.duplicateInstance)
  const removeInstance = useFactoryStore((s) => s.removeInstance)
  const requestCameraPreset = useFactoryStore((s) => s.requestCameraPreset)
  const placingAssetId = useFactoryStore((s) => s.placingAssetId)
  const setPlacingAsset = useFactoryStore((s) => s.setPlacingAsset)
  const snapEnabled = useFactoryStore((s) => s.snapEnabled)
  const gridSize = useFactoryStore((s) => s.gridSize)
  const toggleSnap = useFactoryStore((s) => s.toggleSnap)
  const setGridSize = useFactoryStore((s) => s.setGridSize)
  const versions = useFactoryStore((s) => s.layoutVersions)
  const loadVersions = useFactoryStore((s) => s.loadLayoutVersions)
  const saveVersion = useFactoryStore((s) => s.saveLayoutVersion)
  const restoreVersion = useFactoryStore((s) => s.restoreLayoutVersion)
  const editorBusy = useFactoryStore((s) => s.editorBusy)
  const editorError = useFactoryStore((s) => s.editorError)

  const [tab, setTab] = useState<InspectorTab>('properties')
  const [name, setName] = useState('')
  const [x, setX] = useState('0')
  const [y, setY] = useState('0')
  const [z, setZ] = useState('0')
  const [rotation, setRotation] = useState('0')
  const [assetSearch, setAssetSearch] = useState('')
  const [versionName, setVersionName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)

  const selected = twin?.instances.find((instance) => instance.id === selectedId)
  const selectedAsset = twin?.assets.find((asset) => asset.id === selected?.asset_id)
  const runtime = selected ? machines[selected.id] : undefined

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setX(numberDraft(selected.x))
    setY(numberDraft(selected.y))
    setZ(numberDraft(selected.z))
    setRotation(numberDraft((selected.rotation_y * 180) / Math.PI))
    setDeleteConfirm(false)
  }, [selected?.id, selected?.name, selected?.x, selected?.y, selected?.z, selected?.rotation_y])

  useEffect(() => {
    if (tab === 'versions') loadVersions()
  }, [loadVersions, tab])

  const placeableAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase()
    return (twin?.assets ?? [])
      .filter((asset) => !PLACEABLE_EXCLUDE.has(asset.category))
      .filter((asset) => !query || `${asset.name} ${asset.category}`.toLowerCase().includes(query))
  }, [assetSearch, twin?.assets])

  if (!twin) return null

  const commitName = () => {
    const next = name.trim()
    if (selected && next && next !== selected.name) renameInstance(selected.id, next)
    else if (selected) setName(selected.name)
  }

  const commitTransform = (key: 'x' | 'y' | 'z' | 'rotation_y', draft: string) => {
    if (!selected) return
    const numeric = Number(draft)
    if (!Number.isFinite(numeric)) {
      setX(numberDraft(selected.x)); setY(numberDraft(selected.y)); setZ(numberDraft(selected.z));
      setRotation(numberDraft((selected.rotation_y * 180) / Math.PI))
      return
    }
    updateInstanceTransform(selected.id, {
      [key]: key === 'rotation_y' ? (numeric * Math.PI) / 180 : numeric,
    })
  }

  const path = selected ? machinePath(selected.id) : []

  return (
    <aside className="machine-inspector" aria-label="Layout inspector">
      <header className="machine-inspector-header">
        <div>
          <p>Layout editor</p>
          <h2>{selected ? selected.name : 'Twin workspace'}</h2>
        </div>
        {selected && (
          <div className="machine-inspector-head-actions">
            <button onClick={() => requestCameraPreset('focus', selected.id)} title="Focus camera on machine">
              <IndustrialIcon name="scan" size={16} />
            </button>
            <button onClick={() => select(null)} title="Close selection">
              <IndustrialIcon name="close" size={16} />
            </button>
          </div>
        )}
      </header>

      <div className="machine-inspector-tabs" role="tablist">
        <button className={tab === 'properties' ? 'active' : ''} onClick={() => setTab('properties')}>
          <IndustrialIcon name="edit" size={15} /> Properties
        </button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          <IndustrialIcon name="plus" size={15} /> Machine library
        </button>
        <button className={tab === 'versions' ? 'active' : ''} onClick={() => setTab('versions')}>
          <IndustrialIcon name="history" size={15} /> Versions
        </button>
      </div>

      <div className="machine-inspector-content">
        {tab === 'properties' && !selected && (
          <div className="machine-empty-selection">
            <span><IndustrialIcon name="cursor" size={25} /></span>
            <h3>Select a machine to edit it</h3>
            <p>Click an object in the 3D scene or choose one from the factory hierarchy.</p>
            <button className="industrial-secondary-button" onClick={() => setTab('library')}>
              <IndustrialIcon name="plus" size={15} /> Add from machine library
            </button>
          </div>
        )}

        {tab === 'properties' && selected && (
          <>
            <div className="machine-path">
              {path.slice(-4).map((part, index) => <span key={`${part}-${index}`}>{part}</span>)}
            </div>

            <section className="inspector-section">
              <div className="inspector-section-title"><span>Identity</span><small>Editable asset object</small></div>
              <label className="inspector-field">
                <span>Machine name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              </label>
              <label className="inspector-field">
                <span>Machine type</span>
                <select value={selected.asset_id} onChange={(e) => changeInstanceType(selected.id, e.target.value)}>
                  {twin.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </select>
              </label>
              <div className="inspector-readonly-row"><span>Machine ID</span><code title={selected.id}>{selected.id}</code></div>
              <div className="inspector-readonly-row"><span>Source</span><strong>{selected.source === 'ai_reconstruction' || selected.source.startsWith('reconstruction:') ? 'AI reconstruction' : selected.source || 'Factory Memory'}</strong></div>
            </section>

            <section className="inspector-section">
              <div className="inspector-section-title"><span>Transform</span><small>Metres · world space</small></div>
              <div className="transform-fields">
                {[
                  ['X', x, setX, 'x'],
                  ['Y', y, setY, 'y'],
                  ['Z', z, setZ, 'z'],
                ].map(([axis, value, setter, key]) => (
                  <label key={axis as string}>
                    <span>{axis as string}</span>
                    <input
                      type="number"
                      step={gridSize}
                      value={value as string}
                      onChange={(e) => (setter as (next: string) => void)(e.target.value)}
                      onBlur={(e) => commitTransform(key as 'x' | 'y' | 'z', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </label>
                ))}
              </div>
              <label className="rotation-field">
                <span><IndustrialIcon name="rotate" size={15} /> Rotation Y</span>
                <div><input type="number" step="1" value={rotation} onChange={(e) => setRotation(e.target.value)} onBlur={(e) => commitTransform('rotation_y', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /><i>°</i></div>
              </label>
              <div className="snap-control">
                <button className={snapEnabled ? 'active' : ''} onClick={toggleSnap} aria-pressed={snapEnabled}>
                  <IndustrialIcon name="grid" size={15} /> Snap to grid <i>{snapEnabled ? 'On' : 'Off'}</i>
                </button>
                <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} disabled={!snapEnabled} aria-label="Grid size">
                  <option value="0.25">0.25 m</option>
                  <option value="0.5">0.5 m</option>
                  <option value="1">1 m</option>
                  <option value="2">2 m</option>
                </select>
              </div>
            </section>

            <section className="inspector-section">
              <div className="inspector-section-title"><span>Machine status</span><small>Operational state</small></div>
              <div className="machine-status-picker">
                {STATUSES.map((status) => (
                  <button key={status} className={runtime?.status === status ? 'active' : ''} onClick={() => setStatus(selected.id, status)}>
                    <i style={{ background: STATUS_COLORS[status] }} />
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </section>

            <section className="inspector-section inspector-object-summary">
              <div><span>Footprint</span><strong>{selectedAsset?.footprint_w.toFixed(1) ?? '—'} × {selectedAsset?.footprint_d.toFixed(1) ?? '—'} m</strong></div>
              <div><span>Category</span><strong>{selectedAsset?.category.replaceAll('_', ' ') ?? 'Unknown'}</strong></div>
            </section>

            <div className="inspector-object-actions">
              <button onClick={() => duplicateInstance(selected.id)}><IndustrialIcon name="copy" size={16} /> Duplicate</button>
              {!deleteConfirm ? (
                <button className="danger" onClick={() => setDeleteConfirm(true)}><IndustrialIcon name="trash" size={16} /> Delete</button>
              ) : (
                <button className="danger confirm" onClick={() => removeInstance(selected.id)}><IndustrialIcon name="warning" size={16} /> Confirm delete</button>
              )}
            </div>
          </>
        )}

        {tab === 'library' && (
          <div className="machine-library">
            <div className="machine-library-intro">
              <h3>Add a machine</h3>
              <p>Choose an asset, then click the factory floor to position it.</p>
            </div>
            <label className="industrial-search-field">
              <IndustrialIcon name="search" size={16} />
              <input placeholder="Search CNC, robot, conveyor…" value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} />
              {assetSearch && <button onClick={() => setAssetSearch('')} aria-label="Clear search"><IndustrialIcon name="close" size={14} /></button>}
            </label>
            {placingAssetId && (
              <div className="placing-instruction">
                <span><IndustrialIcon name="cursor" size={17} /></span>
                <p><strong>Placement active</strong><small>Click the floor to add this asset. Grid snapping is {snapEnabled ? 'on' : 'off'}.</small></p>
                <button onClick={() => setPlacingAsset(null)}>Cancel</button>
              </div>
            )}
            <div className="machine-library-grid">
              {placeableAssets.map((asset) => (
                <button key={asset.id} className={placingAssetId === asset.id ? 'active' : ''} onClick={() => setPlacingAsset(placingAssetId === asset.id ? null : asset.id)}>
                  <span><IndustrialIcon name={asset.category.includes('robot') ? 'sparkles' : asset.category.includes('conveyor') || asset.category.includes('line') ? 'front' : 'box'} size={19} /></span>
                  <p><strong>{asset.name}</strong><small>{asset.category.replaceAll('_', ' ')} · {asset.footprint_w.toFixed(1)} × {asset.footprint_d.toFixed(1)} m</small></p>
                  <i><IndustrialIcon name="plus" size={14} /></i>
                </button>
              ))}
              {placeableAssets.length === 0 && <p className="machine-library-empty">No machine types match “{assetSearch}”.</p>}
            </div>
          </div>
        )}

        {tab === 'versions' && (
          <div className="layout-versions-panel">
            <div className="machine-library-intro">
              <h3>Layout versions</h3>
              <p>Save proposals and restore a previous arrangement when needed.</p>
            </div>
            <div className="version-create-row">
              <input placeholder="Version name…" value={versionName} onChange={(e) => setVersionName(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter' && versionName.trim()) {
                  saveVersion(versionName.trim())
                  setVersionName('')
                }
              }} />
              <button disabled={!versionName.trim()} onClick={() => { saveVersion(versionName.trim()); setVersionName('') }}><IndustrialIcon name="save" size={15} /> Save</button>
            </div>
            <div className="layout-version-list">
              {versions.map((version, index) => (
                <div key={version.id} className="layout-version-row">
                  <span><IndustrialIcon name={index === 0 ? 'check' : 'history'} size={16} /></span>
                  <p><strong>{version.label}</strong><small>{new Date(version.created_at).toLocaleString()}</small></p>
                  {restoreConfirm !== version.id ? (
                    <button onClick={() => setRestoreConfirm(version.id)}>Restore</button>
                  ) : (
                    <button className="confirm" onClick={async () => { await restoreVersion(version.id); setRestoreConfirm(null) }}>Confirm</button>
                  )}
                </div>
              ))}
              {versions.length === 0 && <div className="machine-empty-selection compact"><span><IndustrialIcon name="history" size={22} /></span><h3>No saved versions</h3><p>Save the current arrangement to create your first restore point.</p></div>}
            </div>
          </div>
        )}
      </div>

      {(editorBusy || editorError) && (
        <div className={`machine-inspector-status${editorError ? ' error' : ''}`}>
          {editorBusy ? <span className="industrial-spinner small" /> : <IndustrialIcon name="warning" size={15} />}
          <span>{editorError || 'Saving layout change…'}</span>
        </div>
      )}
    </aside>
  )
}
