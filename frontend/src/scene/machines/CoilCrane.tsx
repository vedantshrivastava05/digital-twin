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

const CAUTION = '#e0a021'
const STEEL = '#5b6577'
const COIL = '#7c8797'

const BEAM_Y = 6.2
const SPAN = 8 // portal legs straddle the coil yard (along z)
const TRAVEL = 3.4 // trolley travel along the beam (x)

/**
 * Portal gantry crane in the coil yard: straddles the incoming steel coils and
 * shuttles one along the top beam, hoisting it up and over toward the blanking
 * line's uncoiler. Slow, continuous handling motion.
 */
export function CoilCrane({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const trolley = useRef<Group>(null)
  const hoist = useRef<Group>(null)
  const t = useRef(Math.random() * 100)

  useFrame((_, dt) => {
    t.current += dt * (0.1 + statusSpeed(status) * 0.3)
    if (trolley.current) trolley.current.position.x = Math.sin(t.current * 0.6) * TRAVEL
    // Lift while traversing, lower at the ends (pick / place).
    if (hoist.current) hoist.current.position.y = -1.6 - Math.abs(Math.cos(t.current * 0.6)) * 1.6
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[TRAVEL + 0.6, 0.1, 0.6]}
      labelY={7.4}
      noPlinth
    >
      {/* Portal legs (4) + wheels on ground rails */}
      {[-TRAVEL - 0.8, TRAVEL + 0.8].map((x) =>
        [SPAN / 2, -SPAN / 2].map((z) => (
          <group key={`${x}:${z}`} position={[x, 0, z]}>
            <mesh position={[0, BEAM_Y / 2, 0]} castShadow>
              <boxGeometry args={[0.4, BEAM_Y, 0.4]} />
              <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.18, 0]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.22, 0.22, 0.3, 12]} />
              <meshStandardMaterial color="#17191e" />
            </mesh>
          </group>
        )),
      )}
      {/* Top gantry beams along z (both sides) */}
      {[SPAN / 2, -SPAN / 2].map((z) => (
        <mesh key={z} position={[0, BEAM_Y, z]} castShadow>
          <boxGeometry args={[(TRAVEL + 1) * 2, 0.5, 0.5]} />
          <meshStandardMaterial color={CAUTION} metalness={0.3} roughness={0.5} />
        </mesh>
      ))}
      {/* Cross rail the trolley rides */}
      <mesh position={[0, BEAM_Y + 0.35, 0]}>
        <boxGeometry args={[(TRAVEL + 1) * 2, 0.2, SPAN + 1]} />
        <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.5} transparent opacity={0.25} />
      </mesh>

      {/* Trolley + hoisted coil */}
      <group ref={trolley} position={[0, BEAM_Y, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[1.2, 0.6, 1.6]} />
          <meshStandardMaterial color="#3a4150" metalness={0.4} roughness={0.5} />
        </mesh>
        {[-0.45, 0.45].map((z) => (
          <mesh key={z} position={[0, -0.9, z]}>
            <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
            <meshStandardMaterial color="#20242d" />
          </mesh>
        ))}
        {/* C-hook + steel coil */}
        <group ref={hoist} position={[0, -1.6, 0]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.3, 0.5, 0.3]} />
            <meshStandardMaterial color="#20242d" metalness={0.6} roughness={0.4} />
          </mesh>
          <group rotation-x={Math.PI / 2}>
            <mesh castShadow>
              <cylinderGeometry args={[0.95, 0.95, 1.3, 26]} />
              <meshStandardMaterial color={COIL} metalness={0.55} roughness={0.45} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[0.32, 0.32, 1.32, 18]} />
              <meshStandardMaterial color="#20242d" />
            </mesh>
          </group>
        </group>
      </group>
    </MachineShell>
  )
}
