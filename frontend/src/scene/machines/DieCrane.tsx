import { useRef } from 'react'
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
const STEEL = '#5b6577'
const CAUTION = '#e0a021'

const RUNWAY_Z = 22 // rails sit near the two long walls
const RUNWAY_Y = 7.6
const RAIL_LEN = 70 // along x (the bay length)

/**
 * Overhead die-change bridge crane: two runway rails near the walls, a bridge
 * girder that traverses slowly along the bay, a trolley that cross-travels, and
 * a die block on the hoist. Mostly idles (maintenance equipment), so it drifts
 * gently rather than running a production cycle.
 */
export function DieCrane({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const bridge = useRef<Group>(null)
  const trolley = useRef<Group>(null)
  const hook = useRef<Group>(null)
  const t = useRef(Math.random() * 100)

  useFrame((_, dt) => {
    t.current += dt * (0.12 + statusSpeed(status) * 0.28)
    if (bridge.current) bridge.current.position.x = Math.sin(t.current * 0.5) * 18
    if (trolley.current) trolley.current.position.z = Math.sin(t.current * 0.68) * 14
    if (hook.current) hook.current.position.y = -2.4 + Math.sin(t.current * 0.9) * 0.5
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[0.6, 0.1, 0.6]}
      labelY={9.2}
      noPlinth
    >
      {/* Runway rails along both walls */}
      {[RUNWAY_Z, -RUNWAY_Z].map((z) => (
        <mesh key={z} position={[0, RUNWAY_Y, z]} castShadow>
          <boxGeometry args={[RAIL_LEN, 0.5, 0.55]} />
          <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.5} />
        </mesh>
      ))}

      {/* Traversing bridge */}
      <group ref={bridge}>
        {/* Twin-box girder spanning the bay */}
        {[0.45, -0.45].map((dz) => (
          <mesh key={dz} position={[0, RUNWAY_Y + 0.75, dz * 1]} castShadow>
            <boxGeometry args={[1.1, 0.7, RUNWAY_Z * 2 + 1]} />
            <meshStandardMaterial color={FRAME} metalness={0.35} roughness={0.55} />
          </mesh>
        ))}
        {/* End trucks riding the rails */}
        {[RUNWAY_Z, -RUNWAY_Z].map((z) => (
          <mesh key={z} position={[0, RUNWAY_Y + 0.2, z]} castShadow>
            <boxGeometry args={[2.2, 0.7, 1.2]} />
            <meshStandardMaterial color={CAUTION} metalness={0.3} roughness={0.5} />
          </mesh>
        ))}

        {/* Cross-travelling trolley + hoist */}
        <group ref={trolley} position={[0, RUNWAY_Y + 0.75, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[1.6, 0.8, 1.8]} />
            <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Hoist ropes */}
          {[-0.5, 0.5].map((dx) => (
            <mesh key={dx} position={[dx, -1.3, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 2.6, 6]} />
              <meshStandardMaterial color="#20242d" />
            </mesh>
          ))}
          {/* Die block on the hook */}
          <group ref={hook} position={[0, -2.4, 0]}>
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[0.5, 0.5, 0.5]} />
              <meshStandardMaterial color="#20242d" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh castShadow>
              <boxGeometry args={[2.3, 1.0, 2.0]} />
              <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </MachineShell>
  )
}
