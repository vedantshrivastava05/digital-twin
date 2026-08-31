import { useState } from 'react'
import { useFactoryStore } from '../store'

/** Names a freshly drawn zone rectangle */
export function ZoneDialog() {
  const zoneDraft = useFactoryStore((s) => s.zoneDraft)
  const setZoneDraft = useFactoryStore((s) => s.setZoneDraft)
  const saveZoneDraft = useFactoryStore((s) => s.saveZoneDraft)
  const [name, setName] = useState('')

  if (!zoneDraft?.done) return null

  const save = async () => {
    await saveZoneDraft(name)
    setName('')
  }

  return (
    <div className="pin-dialog">
      <h3>Name this zone</h3>
      <textarea
        autoFocus
        rows={1}
        placeholder="e.g. Staging Area"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
      />
      <div className="pin-dialog-actions">
        <button className="secondary" onClick={() => setZoneDraft(null)}>
          Cancel
        </button>
        <button onClick={save} disabled={!name.trim()}>
          Save zone
        </button>
      </div>
    </div>
  )
}
