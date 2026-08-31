import { useMemo } from 'react'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { useMachineRuntime } from '../../store'
import { indexFromId, panelGeometry, panelKindForIndex, type PanelKind } from '../panelShapes'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const FRAME = '#4a5260'
const PANEL = '#c8d0dc'

// Per-kind fit so each silhouette sits sensibly on the A-frame slopes.
const PANEL_SCALE: Record<PanelKind, number> = { door: 1.0, hood: 1.0, side: 0.62, floor: 0.7 }

/**
 * A-frame stillage of finished stamped panels waiting for pickup to the body
 * shop. Each rack holds one panel type (sorted by type), leaning on both sloped
 * faces of a steel A-frame. Static prop.
 */
export function PanelRack({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const kind = useMemo(() => panelKindForIndex(indexFromId(instance.id)), [instance.id])
  const geom = useMemo(() => panelGeometry(kind), [kind])
  const scale = PANEL_SCALE[kind]

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.2, 0.1, asset.footprint_d / 2 - 0.2]}
      labelY={2.6}
    >
      {/* Base skids */}
      {[-1.0, 1.0].map((z) => (
        <mesh key={z} position={[0, 0.16, z]} castShadow>
          <boxGeometry args={[3.0, 0.2, 0.22]} />
          <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* A-frame ends */}
      {[-1.3, 1.3].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.95, s * 0.45]} rotation-x={s * 0.42} castShadow>
              <boxGeometry args={[0.12, 1.9, 0.12]} />
              <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Ridge bar */}
      <mesh position={[0, 1.85, 0]} castShadow>
        <boxGeometry args={[2.9, 0.12, 0.12]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>
      {/* Shaped panels of this rack's type leaning on both slopes */}
      {[-1, 1].map((s) =>
        [-0.7, 0, 0.7].map((dx) => (
          <mesh
            key={`${s}:${dx}`}
            geometry={geom}
            position={[dx, 1.05, s * 0.62]}
            rotation-x={s * 0.42}
            rotation-y={-Math.PI / 2}
            scale={scale}
            castShadow
          >
            <meshStandardMaterial color={PANEL} metalness={0.55} roughness={0.38} side={2} />
          </mesh>
        )),
      )}
    </MachineShell>
  )
}
