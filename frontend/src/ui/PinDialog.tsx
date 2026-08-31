import { useState } from 'react'
import { useFactoryStore } from '../store'

/** Small dialog shown after clicking a spot in pin mode */
export function PinDialog() {
  const pendingPin = useFactoryStore((s) => s.pendingPin)
  const setPendingPin = useFactoryStore((s) => s.setPendingPin)
  const savePendingPin = useFactoryStore((s) => s.savePendingPin)
  const twin = useFactoryStore((s) => s.twin)
  const [text, setText] = useState('')

  if (!pendingPin) return null

  const machine = pendingPin.instanceId
    ? twin?.instances.find((i) => i.id === pendingPin.instanceId)
    : null

  const save = async () => {
    await savePendingPin(text)
    setText('')
  }

  return (
    <div className="pin-dialog">
      <h3>New annotation</h3>
      <p className="dim">
        {machine ? `On ${machine.name}` : `At (${pendingPin.x.toFixed(1)}, ${pendingPin.z.toFixed(1)})`}
      </p>
      <textarea
        autoFocus
        rows={3}
        placeholder="Note, issue, reminder…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          }
        }}
      />
      <div className="pin-dialog-actions">
        <button className="secondary" onClick={() => setPendingPin(null)}>
          Cancel
        </button>
        <button onClick={save} disabled={!text.trim()}>
          Save pin
        </button>
      </div>
    </div>
  )
}
