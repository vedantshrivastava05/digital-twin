import { useEffect, useRef, useState } from 'react'
import { useFactoryStore } from '../store'
import { IndustrialIcon } from './IndustrialIcon'

interface SaveLayoutDialogProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export function SaveLayoutDialog({ open, onClose, onSaved }: SaveLayoutDialogProps) {
  const saveLayoutVersion = useFactoryStore((s) => s.saveLayoutVersion)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date())
    setLabel(`Proposed Layout · ${date}`)
    setError('')
    requestAnimationFrame(() => input.current?.select())
  }, [open])

  const save = async () => {
    if (!label.trim()) return
    setBusy(true)
    setError('')
    try {
      await saveLayoutVersion(label.trim())
      const storeError = useFactoryStore.getState().editorError
      if (storeError) throw new Error(storeError)
      onSaved?.()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="industrial-dialog-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !busy) onClose()
    }}>
      <section className="layout-save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-layout-title">
        <div className="layout-save-icon"><IndustrialIcon name="save" size={22} /></div>
        <h2 id="save-layout-title">Save layout version</h2>
        <p>Create a restorable snapshot of every machine position, rotation, type, and zone.</p>
        <label>
          Version name
          <input
            ref={input}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
              if (event.key === 'Escape') onClose()
            }}
            placeholder="Current Layout"
          />
        </label>
        <div className="layout-name-suggestions">
          {['Current Layout', 'Proposed Layout', 'Layout Version 2'].map((name) => (
            <button key={name} onClick={() => setLabel(name)}>{name}</button>
          ))}
        </div>
        {error && <div className="reconstruction-error"><IndustrialIcon name="warning" size={16} /><span>{error}</span></div>}
        <div className="layout-save-actions">
          <button className="industrial-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="industrial-solid-button" onClick={save} disabled={busy || !label.trim()}>
            {busy ? <span className="industrial-spinner small" /> : <IndustrialIcon name="save" size={16} />}
            {busy ? 'Saving…' : 'Save version'}
          </button>
        </div>
      </section>
    </div>
  )
}
