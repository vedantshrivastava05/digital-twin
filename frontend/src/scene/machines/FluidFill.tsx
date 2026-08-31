import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { CYCLE_SEC, GA_LINE_ID, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

/** The three circuits filled at this station, with their drum colours. */
const CIRCUITS = [
  { label: 'brake', x: 1.2, colour: '#e8b21e' },
  { label: 'coolant', x: 0, colour: '#22c55e' },
  { label: 'screenwash', x: -1.2, colour: '#38bdf8' },
]

const HOME_Y = 3.1
const FILL_Y = 1.75

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * Fluid fill station: overhead fill heads on hose reels drop into the engine bay
 * to charge brake fluid, coolant and screenwash from the line-side drums, then
 * retract before the line indexes. Sequenced to the GA line dwell.
 */
export function FluidFill({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(GA_LINE_ID)
  const heads = useRef<(Group | null)[]>([])
  const hoses = useRef<(Group | null)[]>([])
  const lamps = useRef<(MeshStandardMaterial | null)[]>([])
  const drop = useRef(0)

  useFrame((_, dt) => {
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1
    // drop (0.3-0.5) -> fill (0.5-0.8) -> retract (0.8-1.0)
    const target =
      status === 'down' ? 0 : smoothstep((f - 0.3) / 0.2) - smoothstep((f - 0.8) / 0.2)
    drop.current += (target - drop.current) * Math.min(1, dt * (5 + statusSpeed(status)))
    const d = drop.current
    const y = HOME_Y - (HOME_Y - FILL_Y) * d
    heads.current.forEach((h) => {
      if (h) h.position.y = y
    })
    hoses.current.forEach((h) => {
      if (!h) return
      h.position.y = (HOME_Y + 0.55 + y) / 2
      h.scale.y = Math.max(0.05, HOME_Y + 0.55 - y)
    })
    const filling = d > 0.85
    lamps.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = filling ? 1.6 + Math.sin(clock.t * 6 + i) * 0.5 : 0.15
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, 3.6]}
      labelY={4.6}
      noPlinth
    >
      {/* Portal frame the fill heads hang from */}
      {[2.6, -2.6].map((z) => (
        <mesh key={z} position={[0, 1.95, z]} castShadow>
          <boxGeometry args={[0.24, 3.9, 0.24]} />
          <meshStandardMaterial color="#9aa2ac" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 3.9, 0]} castShadow>
        <boxGeometry args={[3.4, 0.24, 5.4]} />
        <meshStandardMaterial color="#9aa2ac" metalness={0.4} roughness={0.5} />
      </mesh>

      {CIRCUITS.map((c, i) => (
        <group key={c.label} position={[c.x, 0, 0]}>
          {/* Hose reel on the portal beam */}
          <group position={[0, HOME_Y + 0.55, 0]}>
            <mesh rotation-z={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.28, 0.28, 0.34, 16]} />
              <meshStandardMaterial color="#3d444e" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.32, 0.32, 0.06, 16]} />
              <meshStandardMaterial color={c.colour} metalness={0.3} roughness={0.5} />
            </mesh>
          </group>
          {/* Hose paying out as the head drops */}
          <group
            ref={(el) => {
              hoses.current[i] = el
            }}
            position={[0, (HOME_Y + 0.55 + HOME_Y) / 2, 0]}
          >
            <mesh>
              <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
              <meshStandardMaterial color="#20242d" roughness={0.85} />
            </mesh>
          </group>
          {/* Fill head with its status lamp and nozzle */}
          <group
            ref={(el) => {
              heads.current[i] = el
            }}
            position={[0, HOME_Y, 0]}
          >
            <mesh castShadow>
              <boxGeometry args={[0.5, 0.44, 0.5]} />
              <meshStandardMaterial color="#e8ecef" metalness={0.25} roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.28, 0]}>
              <sphereGeometry args={[0.1, 12, 10]} />
              <meshStandardMaterial
                ref={(el) => {
                  lamps.current[i] = el
                }}
                color={c.colour}
                emissive={c.colour}
                emissiveIntensity={0.15}
              />
            </mesh>
            <mesh position={[0, -0.36, 0]}>
              <cylinderGeometry args={[0.06, 0.09, 0.3, 10]} />
              <meshStandardMaterial color="#8a929e" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>
          {/* Line-side drum with pump head */}
          <group position={[0, 0, 3.4]}>
            <mesh position={[0, 0.55, 0]} castShadow>
              <cylinderGeometry args={[0.42, 0.42, 1.1, 18]} />
              <meshStandardMaterial color={c.colour} metalness={0.3} roughness={0.55} />
            </mesh>
            {[0.28, 0.82].map((y) => (
              <mesh key={y} position={[0, y, 0]}>
                <cylinderGeometry args={[0.44, 0.44, 0.06, 18]} />
                <meshStandardMaterial color="#8a929e" metalness={0.5} roughness={0.45} />
              </mesh>
            ))}
            <mesh position={[0, 1.35, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.5, 10]} />
              <meshStandardMaterial color="#3d444e" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Station control panel */}
      <group position={[2.2, 0, 2.4]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[1.0, 1.7, 0.55]} />
          <meshStandardMaterial color="#c3c9d1" metalness={0.2} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.25, 0.29]}>
          <planeGeometry args={[0.7, 0.45]} />
          <meshStandardMaterial color="#07222c" emissive="#1c7f9c" emissiveIntensity={0.9} />
        </mesh>
      </group>
    </MachineShell>
  )
}
