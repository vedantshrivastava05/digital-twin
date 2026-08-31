import { useEffect, useState } from 'react'
import { useFactoryStore } from '../store'

const PLACEABLE_EXCLUDE = new Set(['bodyline', 'trimline'])

export function BuilderPanel() {
  const twin = useFactoryStore((s) => s.twin)
  const placingAssetId = useFactoryStore((s) => s.placingAssetId)
  const setPlacingAsset = useFactoryStore((s) => s.setPlacingAsset)
  const zoneDrawMode = useFactoryStore((s) => s.zoneDrawMode)
  const setZoneDrawMode = useFactoryStore((s) => s.setZoneDrawMode)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const rotateInstance = useFactoryStore((s) => s.rotateInstance)
  const renameInstance = useFactoryStore((s) => s.renameInstance)
  const removeInstance = useFactoryStore((s) => s.removeInstance)
  const removeZone = useFactoryStore((s) => s.removeZone)
  const layoutVersions = useFactoryStore((s) => s.layoutVersions)
  const loadLayoutVersions = useFactoryStore((s) => s.loadLayoutVersions)
  const saveLayoutVersion = useFactoryStore((s) => s.saveLayoutVersion)
  const restoreLayoutVersion = useFactoryStore((s) => s.restoreLayoutVersion)

  const [versionLabel, setVersionLabel] = useState('')
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    loadLayoutVersions()
  }, [loadLayoutVersions])

  const selected = twin?.instances.find((i) => i.id === selectedId)

  useEffect(() => {
    setNameDraft(selected?.name ?? '')
  }, [selected?.id, selected?.name])

  if (!twin) return null

  const placeable = twin.assets.filter((a) => !PLACEABLE_EXCLUDE.has(a.category))

  return (
    <div className="builder-panel">
      <h2>Manual Builder</h2>

      <div className="builder-section">
        <h3>Place from catalog</h3>
        <div className="catalog-grid">
          {placeable.map((asset) => (
            <button
              key={asset.id}
              className={`catalog-item${placingAssetId === asset.id ? ' active' : ''}`}
              onClick={() =>
                setPlacingAsset(placingAssetId === asset.id ? null : asset.id)
              }
            >
              {asset.name}
            </button>
          ))}
        </div>
        {placingAssetId && <p className="dim">Click the floor to place · click again for more</p>}
      </div>

      <div className="builder-section">
        <h3>Zones</h3>
        <button
          className={`tool-btn${zoneDrawMode ? ' active' : ''}`}
          onClick={() => setZoneDrawMode(!zoneDrawMode)}
        >
          {zoneDrawMode ? 'Drag on floor to draw…' : 'Draw zone'}
        </button>
        {twin.zones.map((zone) => (
          <div key={zone.id} className="row-item">
            <span>{zone.name}</span>
            <button className="danger" onClick={() => removeZone(zone.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="builder-section">
          <h3>Selected: {selected.name}</h3>
          <input
            className="text-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim() && nameDraft !== selected.name)
                renameInstance(selected.id, nameDraft.trim())
            }}
          />
          <div className="btn-row">
            <button className="tool-btn" onClick={() => rotateInstance(selected.id)}>
              Rotate 90°
            </button>
            <button
              className="tool-btn danger"
              onClick={() => removeInstance(selected.id)}
            >
              Delete
            </button>
          </div>
          <p className="dim">Drag the machine on the floor to move it</p>
        </div>
      )}

      <div className="builder-section">
        <h3>Layout versions</h3>
        <div className="btn-row">
          <input
            className="text-input"
            placeholder="Version label…"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
          />
          <button
            className="tool-btn"
            disabled={!versionLabel.trim()}
            onClick={() => {
              saveLayoutVersion(versionLabel.trim())
              setVersionLabel('')
            }}
          >
            Save
          </button>
        </div>
        {layoutVersions.map((version) => (
          <div key={version.id} className="row-item">
            <span>
              {version.label}
              <em>{new Date(version.created_at).toLocaleString()}</em>
            </span>
            <button onClick={() => restoreLayoutVersion(version.id)}>Restore</button>
          </div>
        ))}
      </div>
    </div>
  )
}
