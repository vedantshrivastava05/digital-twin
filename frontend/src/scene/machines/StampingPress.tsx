import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { useMachineRuntime } from '../../store'
import { CYCLE_SEC, STAMP_LINE_ID, getLineClock } from '../lineClock'
import { indexFromId, panelGeometry, panelKindForIndex } from '../panelShapes'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const FRAME = '#3f4a5e'
const STEEL = '#5b6577'

// Dwell window (fraction of the cycle) during which the part is parked at the
// station and the ram strokes — matches cycleInfo()'s welding window so presses
// stamp exactly while transfer robots hold, then all index together.
const DWELL0 = 0.38
const DWELL1 = 0.95

/**
 * Heavy stamping press: a big C/portal frame with a ram that strokes down onto
 * the bolster, forming a sheet-metal panel that flashes red-hot on impact. All
 * presses on the line share one clock, so they stamp in lockstep during the
 * dwell and stay up while the line indexes.
 */
export function StampingPress({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const ram = useRef<Mesh>(null)
  const panel = useRef<Mesh>(null)
  const clock = getLineClock(STAMP_LINE_ID)
  // Each press along the line forms a different recognizable panel.
  const geom = useMemo(() => panelGeometry(panelKindForIndex(indexFromId(instance.id))), [instance.id])

  useFrame(() => {
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1
    let stroke = 0
    if (status !== 'down' && f > DWELL0 && f < DWELL1) {
      const p = (f - DWELL0) / (DWELL1 - DWELL0)
      stroke = Math.sin(p * Math.PI) // 0 -> 1 -> 0: ram down then back up
    }
    if (ram.current) ram.current.position.y = 3.9 - stroke * 1.35
    if (panel.current) {
      const mat = panel.current.material as MeshStandardMaterial
      mat.emissiveIntensity = stroke > 0.85 ? 1.5 : 0.12
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.3, 0.1, asset.footprint_d / 2 - 0.3]}
      labelY={5.4}
    >
      {/* Bed / bolster */}
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.0, 1.4, 2.4]} />
        <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[2.4, 0.3, 1.9]} />
        <meshStandardMaterial color="#2a313d" />
      </mesh>
      {/* Uprights */}
      {[-1.25, 1.25].map((x) => (
        <mesh key={x} position={[x, 2.6, 0]} castShadow>
          <boxGeometry args={[0.5, 3.4, 2.2]} />
          <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      {/* Crown */}
      <mesh position={[0, 4.5, 0]} castShadow>
        <boxGeometry args={[3.4, 0.9, 2.4]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>
      {/* Ram */}
      <mesh ref={ram} position={[0, 3.9, 0]} castShadow>
        <boxGeometry args={[2.2, 0.8, 1.9]} />
        <meshStandardMaterial color="#8b96a8" metalness={0.4} roughness={0.45} />
      </mesh>
      {/* Formed panel on the bolster — a recognizable stamped silhouette that
          flashes red-hot on the stroke. */}
      <mesh ref={panel} geometry={geom} position={[0, 1.72, 0]} rotation-x={-Math.PI / 2} castShadow>
        <meshStandardMaterial
          color="#c8d0dc"
          metalness={0.6}
          roughness={0.35}
          emissive="#ff7a3c"
          emissiveIntensity={0.15}
        />
      </mesh>
    </MachineShell>
  )
}
