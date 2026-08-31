import { useEffect, useState } from 'react'
import { fetchTwin } from '../api'
import type { TwinDto } from '../types'
import { OpsNav } from './OpsNav'

interface HandoverNoteDto {
  id: string
  shift_date: string
  shift: string
  author: string
  text: string
  machine_id: string | null
  machine_name: string | null
  created_at: string
}

export function HandoverPage() {
  const [notes, setNotes] = useState<HandoverNoteDto[]>([])
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [machineId, setMachineId] = useState('')

  const refresh = (q = '') =>
    fetch(`/api/handover-notes${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then((r) => r.json())
      .then(setNotes)

  useEffect(() => {
    fetchTwin().then(setTwin)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => refresh(query), 250)
    return () => clearTimeout(timer)
  }, [query])

  const addNote = async () => {
    if (!text.trim()) return
    await fetch('/api/handover-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        author: author.trim() || 'Operator',
        machine_id: machineId || null,
      }),
    })
    setText('')
    refresh(query)
  }

  return (
    <div className="ops-page">
      <OpsNav active="handover" />
      <header className="ops-header">
        <h1>Shift handover notes</h1>
      </header>

      <div className="order-form">
        <input
          type="text"
          placeholder="Your name"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          style={{ width: 140 }}
        />
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
          <option value="">No machine link</option>
          {twin?.instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="What should the next shift know?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button onClick={addNote} disabled={!text.trim()}>
          Add note
        </button>
      </div>

      <div className="order-form" style={{ padding: '10px 14px' }}>
        <input
          type="text"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      {notes.map((note) => (
        <div key={note.id} className="note-card">
          <div className="note-head">
            <strong>
              {note.shift_date} · Shift {note.shift}
            </strong>
            <span>
              {note.author}
              {note.machine_name ? ` · ${note.machine_name}` : ''}
            </span>
          </div>
          <p>{note.text}</p>
        </div>
      ))}
      {notes.length === 0 && <p className="ops-note">No notes found.</p>}
    </div>
  )
}
