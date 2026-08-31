import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { cycleInfo, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const FRAME = '#3f4a5e'
const CLAMP = '#e6b800'
const HINGE_Z = 2.4
const GATE_H = 2.6

// The framing station straddles the body line (line-body-1); geo gates close
// during the weld dwell in lockstep with the weld robots.
const OPEN_LEAN = 0.55

/**
 * Body framing / respot ("geo") station: two side-frame gates swing in on their
 * hinges and clamp the stamped side-frames onto the floorpan while respot welds
 * are made, then open so the line can index. Synced to the body line clock.
 */
export function FramingStation({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock('line-body-1')
  const gateP = useRef<Group>(null)
  const gateN = useRef<Group>(null)
  const lean = useRef(OPEN_LEAN)

  useFrame((_, dt) => {
    const { welding } = cycleInfo(clock.t)
    // 0 = closed (clamped), OPEN_LEAN = swung out. Closed while welding.
    const target = status === 'down' ? OPEN_LEAN : welding ? 0 : OPEN_LEAN
    lean.current += (target - lean.current) * Math.min(1, dt * (3.5 + statusSpeed(status)))
    if (gateP.current) gateP.current.rotation.x = lean.current
    if (gateN.current) gateN.current.rotation.x = -lean.current
  })

  const Gate = () => (
    <group>
      {/* Vertical posts */}
      {[-1.7, 1.7].map((x) => (
        <mesh key={x} position={[x, GATE_H / 2, 0]} castShadow>
          <boxGeometry args={[0.2, GATE_H, 0.2]} />
          <meshStandardMaterial color={FRAME} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      {/* Cross members */}
      {[0.7, 1.7, 2.4].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[3.4, 0.16, 0.16]} />
          <meshStandardMaterial color={FRAME} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      {/* Clamp fingers reaching inward toward the body */}
      {[-1.2, 0, 1.2].map((x) => (
        <group key={x} position={[x, 1.2, -0.35]}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.5, 0.7]} />
            <meshStandardMaterial color={CLAMP} metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, -0.45]}>
            <boxGeometry args={[0.16, 0.2, 0.3]} />
            <meshStandardMaterial color="#20242d" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  )

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.3, 0.1, asset.footprint_d / 2 - 0.3]}
      labelY={3.4}
      noPlinth
    >
      {/* Base foundations under each gate hinge */}
      {[HINGE_Z, -HINGE_Z].map((z) => (
        <mesh key={z} position={[0, 0.1, z]} receiveShadow>
          <boxGeometry args={[3.8, 0.2, 0.6]} />
          <meshStandardMaterial color="#8a929e" />
        </mesh>
      ))}
      {/* +Z gate (hinges at +Z, swings inward toward the line) */}
      <group ref={gateP} position={[0, 0, HINGE_Z]}>
        <Gate />
      </group>
      {/* -Z gate */}
      <group ref={gateN} position={[0, 0, -HINGE_Z]} rotation-y={Math.PI}>
        <Gate />
      </group>
    </MachineShell>
  )
}
