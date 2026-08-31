import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const FRAME = '#3f4a5e'
const BELT = '#22262e'
const SCRAP = '#7b8390'

const X0 = -4 // low (in-feed under the presses)
const Y0 = 0.62
const X1 = 3 // high (discharge)
const Y1 = 2.72
const N_SCRAP = 6

/**
 * Inclined scrap conveyor: metal offcuts drop from the press line onto the belt
 * and ride up to discharge into a scrap bin/baler. Chunks loop up the incline.
 */
export function ScrapConveyor({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const chunks = useRef<(Group | null)[]>([])
  const phase = useRef(0)

  const angle = Math.atan2(Y1 - Y0, X1 - X0)
  const beltLen = Math.hypot(X1 - X0, Y1 - Y0) + 0.6
  const cx = (X0 + X1) / 2
  const cy = (Y0 + Y1) / 2

  // Slight per-chunk jitter so the scrap looks irregular.
  const jitter = useMemo(
    () => Array.from({ length: N_SCRAP }, () => ({ ry: Math.random() * 3, s: 0.7 + Math.random() * 0.6 })),
    [],
  )

  useFrame((_, dt) => {
    phase.current = (phase.current + dt * statusSpeed(status) * 0.09) % 1
    chunks.current.forEach((c, i) => {
      if (!c) return
      const frac = (phase.current + i / N_SCRAP) % 1
      c.position.x = X0 + frac * (X1 - X0)
      c.position.y = Y0 + frac * (Y1 - Y0) + 0.18
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.3, 0.1, asset.footprint_d / 2 - 0.2]}
      labelY={3.4}
    >
      {/* Inclined belt + side rails */}
      <mesh position={[cx, cy, 0]} rotation-z={angle} receiveShadow>
        <boxGeometry args={[beltLen, 0.12, 1.0]} />
        <meshStandardMaterial color={BELT} roughness={0.9} />
      </mesh>
      {[-0.55, 0.55].map((z) => (
        <mesh key={z} position={[cx, cy + 0.12, z]} rotation-z={angle}>
          <boxGeometry args={[beltLen, 0.16, 0.08]} />
          <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* Support legs */}
      {[X0 + 0.4, X1 - 1.2].map((x, i) => {
        const h = Y0 + ((x - X0) / (X1 - X0)) * (Y1 - Y0)
        return (
          <mesh key={i} position={[x, h / 2, 0]} castShadow>
            <boxGeometry args={[0.14, h, 0.14]} />
            <meshStandardMaterial color={FRAME} />
          </mesh>
        )
      })}

      {/* Scrap chunks riding up */}
      {Array.from({ length: N_SCRAP }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            chunks.current[i] = el
          }}
          position={[X0, Y0, 0]}
          rotation-y={jitter[i].ry}
        >
          <mesh castShadow scale={jitter[i].s}>
            <boxGeometry args={[0.4, 0.22, 0.5]} />
            <meshStandardMaterial color={SCRAP} metalness={0.55} roughness={0.55} />
          </mesh>
        </group>
      ))}

      {/* Scrap bin / baler at the discharge end */}
      <group position={[X1 + 1.7, 0, 0]}>
        <mesh position={[0, 0.06, 0]} receiveShadow>
          <boxGeometry args={[2.4, 0.12, 1.9]} />
          <meshStandardMaterial color="#565d68" />
        </mesh>
        {[
          [0, 1.15, 0.9, 2.4, 0.12],
          [0, 1.15, -0.9, 2.4, 0.12],
          [1.15, 1.15, 0, 0.12, 1.9],
          [-1.15, 1.15, 0, 0.12, 1.9],
        ].map(([px, py, pz, w, d], i) => (
          <mesh key={i} position={[px, py, pz]} castShadow>
            <boxGeometry args={[w, 2.1, d]} />
            <meshStandardMaterial color="#ca9a04" metalness={0.2} roughness={0.7} />
          </mesh>
        ))}
        {/* Piled scrap inside the bin */}
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[2.0, 1.1, 1.5]} />
          <meshStandardMaterial color={SCRAP} metalness={0.5} roughness={0.6} />
        </mesh>
      </group>
    </MachineShell>
  )
}
