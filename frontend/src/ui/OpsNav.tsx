import { useEffect, useState } from 'react'

const LINKS = [
  { key: 'twin', label: '3D Twin', href: '/' },
  { key: 'orders', label: 'Orders', href: '/ops' },
  { key: 'operator', label: 'Operator', href: '/operator' },
  { key: 'quality', label: 'Quality', href: '/quality' },
  { key: 'maintenance', label: 'Maintenance', href: '/maintenance' },
  { key: 'handover', label: 'Handover', href: '/handover' },
  { key: 'alarms', label: 'Alarms', href: '/alarms' },
  { key: 'tags', label: 'Tags', href: '/tags' },
  { key: 'brain', label: 'Brain', href: '/brain' },
  { key: 'whatif', label: 'What-if', href: '/whatif' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'report', label: 'Report', href: '/report' },
] as const

interface NotificationDto {
  id: string
  kind: string
  message: string
  severity: string
  read: boolean
  created_at: string
}

function Bell() {
  const [items, setItems] = useState<NotificationDto[]>([])
  const [open, setOpen] = useState(false)

  const refresh = () =>
    fetch('/api/notifications?unread_only=true')
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {})

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15000)
    return () => clearInterval(id)
  }, [])

  const markAll = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    refresh()
  }

  return (
    <div className="bell-wrap">
      <button className="bell" onClick={() => setOpen(!open)}>
        🔔
        {items.length > 0 && <span className="bell-count">{items.length}</span>}
      </button>
      {open && (
        <div className="bell-dropdown">
          <div className="bell-head">
            <strong>Notifications</strong>
            {items.length > 0 && <button onClick={markAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <p className="bell-empty">All clear</p>}
          {items.map((n) => (
            <div key={n.id} className={`bell-item ${n.severity}`}>
              {n.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OpsNav({ active }: { active: string }) {
  return (
    <nav className="ops-nav">
      <span className="ops-brand">AI Factory</span>
      {LINKS.map((link) => (
        <a
          key={link.key}
          href={link.href}
          className={active === link.key ? 'active' : ''}
        >
          {link.label}
        </a>
      ))}
      <div className="ops-nav-spacer" />
      <Bell />
    </nav>
  )
}
