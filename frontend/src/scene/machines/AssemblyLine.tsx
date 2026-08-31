import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { cycleInfo, getLineClock } from '../lineClock'
import { BodyInWhite } from '../BodyInWhite'
import { MachineShell } from './MachineShell'

const SPAN = 64
const NUM_SLOTS = 8

interface AssemblyLineProps {
  instance: AssetInstanceDto
  asset: AssetDto
}

/**
 * The indexing body line: car shells on skids advance one station per cycle,
 * then dwell while the weld robots work. This component advances its OWN line
 * clock (keyed by its instance id) that the weld robots for this line sync to.
 */
export function AssemblyLine({ instance, asset }: AssemblyLineProps) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const bodies = useRef<(Group | null)[]>([])
  const clock = getLineClock(instance.id)

  useFrame((_, dt) => {
    clock.t += dt * statusSpeed(status)
    const { step, moveEase } = cycleInfo(clock.t)
    bodies.current.forEach((body, i) => {
      if (!body) return
      const frac = ((i + step + moveEase) % NUM_SLOTS) / NUM_SLOTS
      body.position.x = -SPAN / 2 + frac * SPAN
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[31, 0.1, 1.4]}
      labelY={2.6}
    >
      {/* Skid rails running the length of the line */}
      {[-0.55, 0.55].map((z) => (
        <mesh key={z} position={[0, 0.2, z]} castShadow receiveShadow>
          <boxGeometry args={[SPAN + 1, 0.2, 0.22]} />
          <meshStandardMaterial color="#4a5260" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* Rail supports */}
      {Array.from({ length: 17 }, (_, i) => -32 + i * 4).map((x) => (
        <mesh key={x} position={[x, 0.14, 0]}>
          <boxGeometry args={[0.25, 0.12, 1.5]} />
          <meshStandardMaterial color="#3b4250" />
        </mesh>
      ))}
      {/* Car shells on skids */}
      {Array.from({ length: NUM_SLOTS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            bodies.current[i] = el
          }}
          position={[0, 0.3, 0]}
        >
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[4.0, 0.1, 1.85]} />
            <meshStandardMaterial color="#20242d" />
          </mesh>
          <group position={[0, 0.08, 0]}>
            <BodyInWhite />
          </group>
        </group>
      ))}
    </MachineShell>
  )
}
