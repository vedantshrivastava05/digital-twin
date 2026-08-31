import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { fetchLabels } from '../api'
import type { LabelDto, SiteDto } from '../types'

interface LabelWithQr extends LabelDto {
  qr: string
}

/** Printable sheet of QR labels; each code deep-links to /asset/:id */
export function LabelSheet() {
  const [labels, setLabels] = useState<LabelWithQr[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const sites = await fetch('/api/sites').then(
          (r) => r.json() as Promise<SiteDto[]>,
        )
        if (!sites.length) throw new Error('no sites')
        const raw = await fetchLabels(sites[0].id)
        const withQr = await Promise.all(
          raw.map(async (label) => ({
            ...label,
            qr: await QRCode.toDataURL(
              `${window.location.origin}/asset/${label.id}`,
              { width: 220, margin: 1 },
            ),
          })),
        )
        setLabels(withQr)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [])

  if (error) return <div className="label-page">Failed to load labels: {error}</div>

  return (
    <div className="label-page">
      <header className="label-header">
        <div>
          <h1>Asset QR labels</h1>
          <p>Print and stick on machines — scanning opens the machine in the twin.</p>
        </div>
        <button onClick={() => window.print()}>Print</button>
      </header>
      <div className="label-grid">
        {labels.map((label) => (
          <div key={label.id} className="label-card">
            <img src={label.qr} alt={label.id} />
            <strong>{label.name}</strong>
            <span>{label.asset_name}</span>
            <code>{label.id}</code>
          </div>
        ))}
      </div>
    </div>
  )
}
