import { useEffect, useRef, useState } from 'react'
import { useFactoryStore } from '../store'

interface Source {
  label: string
  href: string
}

interface ViewerAction {
  type: 'select' | 'highlight'
  instance_ids: string[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
}

const SUGGESTIONS = [
  'Show all down machines',
  'OEE of robot 4L',
  'Top downtime reasons',
  'Which machines need attention?',
  'Any late orders?',
]

export function CopilotPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      const res = await fetch('/api/copilot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = (await res.json()) as {
        answer: string
        sources: Source[]
        actions: ViewerAction[]
      }
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: data.answer, sources: data.sources },
      ])
      const store = useFactoryStore.getState()
      store.setHighlighted([])
      for (const action of data.actions) {
        if (action.type === 'select' && action.instance_ids[0]) {
          store.select(action.instance_ids[0])
        } else if (action.type === 'highlight') {
          store.setHighlighted(action.instance_ids)
        }
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Backend not reachable — is the API running?' },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="copilot-fab" onClick={() => setOpen(true)}>
        ✦ Copilot
      </button>
    )
  }

  return (
    <div className="copilot-panel">
      <div className="copilot-head">
        <strong>✦ Factory Copilot</strong>
        <button
          className="modal-close"
          onClick={() => {
            setOpen(false)
            useFactoryStore.getState().setHighlighted([])
          }}
        >
          ×
        </button>
      </div>

      <div className="copilot-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="copilot-empty">
            <p>Ask about your plant — answers come straight from Factory Memory.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="copilot-suggestion" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`copilot-msg ${msg.role}`}>
            <p>{msg.text}</p>
            {msg.sources && msg.sources.length > 0 && (
              <div className="copilot-sources">
                {msg.sources.map((src) => (
                  <a key={src.href + src.label} href={src.href} target="_blank" rel="noreferrer">
                    {src.label} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="copilot-msg assistant"><p>Thinking…</p></div>}
      </div>

      <form
        className="copilot-input"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <input
          type="text"
          placeholder="e.g. show all down machines"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  )
}
