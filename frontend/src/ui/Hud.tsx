import { useFactoryStore } from '../store'
import { STATUS_COLORS, STATUS_LABELS } from '../constants'
import type { MachineStatus } from '../types'

const STATUSES: MachineStatus[] = ['running', 'idle', 'warning', 'down']

export function Hud() {
  const siteName = useFactoryStore((s) => s.twin?.site.name ?? '')
  const machineCount = useFactoryStore((s) => s.twin?.instances.length ?? 0)
  const deviceOnline = useFactoryStore((s) => s.deviceOnline)
  const deviceTotal = useFactoryStore((s) => s.deviceTotal)
  const counts = useFactoryStore((s) => {
    let running = 0
    let idle = 0
    let warning = 0
    let down = 0
    for (const m of Object.values(s.machines)) {
      if (m.status === 'running') running++
      else if (m.status === 'idle') idle++
      else if (m.status === 'warning') warning++
      else down++
    }
    // Encode as a primitive so the selector stays referentially stable
    return `${running}|${idle}|${warning}|${down}`
  })
  const [running, idle, warning, down] = counts.split('|').map(Number)
  const byStatus: Record<MachineStatus, number> = { running, idle, warning, down }

  return (
    <>
      <div className="hud">
        <h1>AI Factory — {siteName}</h1>
        <p className="subtitle">Live twin · {machineCount} assets · Factory Memory connected</p>
        <div className="legend">
          {STATUSES.map((status) => (
            <div key={status} className="legend-item">
              <span className="dot" style={{ background: STATUS_COLORS[status] }} />
              {STATUS_LABELS[status]}
              <span className="count">{byStatus[status]}</span>
            </div>
          ))}
        </div>
      </div>
      {deviceTotal > 0 && (
        <div className="devices-chip" title="RTLS tags online (forklifts, AGVs, operators)">
          <span className={`live-dot${deviceOnline > 0 ? ' on' : ''}`} />
          Devices <strong>{deviceOnline}/{deviceTotal}</strong>
        </div>
      )}
      <div className="hint">Click a machine for details · drag to orbit · scroll to zoom</div>
    </>
  )
}
