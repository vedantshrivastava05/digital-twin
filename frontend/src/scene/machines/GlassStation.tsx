import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { useMachineRuntime } from '../../store'
import { GA_LINE_ID, CYCLE_SEC, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const RACK_Z = 3.4
const SET_Z = 0.15
const RACK_Y = 1.5
const SET_Y = 1.95

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * Glass setting station: a robot on a cross-bar suction tool lifts a screen off
 * the A-frame glass rack, swings it over the line and presses it into the
 * aperture on the urethane bead. Front screen on one side, rear on the other.
 */
export function GlassStation({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(GA_LINE_ID)
  const tools = useRef<(Group | null)[]>([])
  const glass = useRef<(Group | null)[]>([])

  useFrame(() => {
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1
    // pick (0.0-0.2) -> carry (0.2-0.5) -> press (0.5-0.7) -> return (0.7-1.0)
    const carry = smoothstep((f - 0.2) / 0.3)
    const back = smoothstep((f - 0.7) / 0.3)
    const reach = carry - back
    const press = f > 0.5 && f < 0.7 ? 1 : 0
    tools.current.forEach((t, i) => {
      if (!t) return
      const side = i === 0 ? 1 : -1
      t.position.z = side * (RACK_Z - (RACK_Z - SET_Z) * reach)
      t.position.y = RACK_Y + (SET_Y - RACK_Y) * reach - press * 0.06
      t.rotation.x = side * reach * -0.5
    })
    glass.current.forEach((g) => {
      if (g) g.visible = reach > 0.02 || status !== 'down'
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, 4.2]}
      labelY={3.8}
      noPlinth
    >
      {/* A-frame glass racks either side, screens leaning in the slots */}
      {[1, -1].map((side) => (
        <group key={side} position={[0, 0, side * (RACK_Z + 1.5)]}>
          <mesh position={[0, 0.12, 0]} receiveShadow>
            <boxGeometry args={[3.2, 0.24, 1.9]} />
            <meshStandardMaterial color="#4b535c" metalness={0.35} roughness={0.6} />
          </mesh>
          {[-1.4, 1.4].map((x) => (
            <mesh key={x} position={[x, 1.1, 0]} castShadow>
              <boxGeometry args={[0.12, 1.9, 1.7]} />
              <meshStandardMaterial color="#3f4a5e" metalness={0.3} roughness={0.6} />
            </mesh>
          ))}
          {[-0.45, -0.15, 0.15, 0.45].map((dz) => (
            <mesh key={dz} position={[0, 1.15, dz]} rotation-z={0.1} castShadow>
              <boxGeometry args={[1.5, 1.5, 0.05]} />
              <meshStandardMaterial
                color="#233241"
                metalness={0.2}
                roughness={0.12}
                transparent
                opacity={0.72}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Robot pedestals with the overhead swing boom */}
      {[1, -1].map((side) => (
        <group key={`bot-${side}`} position={[0, 0, side * RACK_Z]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.65, 0.8, 16]} />
            <meshStandardMaterial color="#e8b21e" metalness={0.35} roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.5, 0]} castShadow>
            <boxGeometry args={[0.7, 1.5, 0.7]} />
            <meshStandardMaterial color="#e8b21e" metalness={0.35} roughness={0.5} />
          </mesh>
          <mesh position={[0, 2.45, side * -1.5]} rotation-x={side * 0.18} castShadow>
            <boxGeometry args={[0.36, 0.36, 3.4]} />
            <meshStandardMaterial color="#d9a417" metalness={0.35} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Suction cross-bar tools carrying the screens */}
      {[1, -1].map((side, i) => (
        <group
          key={`tool-${side}`}
          ref={(el) => {
            tools.current[i] = el
          }}
          position={[0, RACK_Y, side * RACK_Z]}
        >
          {/* Drop rod up to the boom */}
          <mesh position={[0, 0.85, 0]}>
            <boxGeometry args={[0.1, 1.7, 0.1]} />
            <meshStandardMaterial color="#5b6371" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Cross bar with four suction cups */}
          <mesh castShadow>
            <boxGeometry args={[1.5, 0.12, 0.12]} />
            <meshStandardMaterial color="#3d444e" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.4]}>
            <boxGeometry args={[0.12, 0.12, 0.9]} />
            <meshStandardMaterial color="#3d444e" metalness={0.4} roughness={0.5} />
          </mesh>
          {[
            [0.55, 0.32],
            [0.55, -0.32],
            [-0.55, 0.32],
            [-0.55, -0.32],
          ].map(([x, z], q) => (
            <mesh key={q} position={[x, -0.16, z]}>
              <cylinderGeometry args={[0.13, 0.16, 0.14, 12]} />
              <meshStandardMaterial color="#1b1f26" roughness={0.85} />
            </mesh>
          ))}
          {/* The screen on the tool */}
          <group
            ref={(el) => {
              glass.current[i] = el
            }}
            position={[0, -0.3, 0]}
          >
            <mesh castShadow>
              <boxGeometry args={[1.45, 0.05, 1.15]} />
              <meshStandardMaterial
                color="#233241"
                metalness={0.2}
                roughness={0.12}
                transparent
                opacity={0.72}
              />
            </mesh>
            {/* Urethane bead round the edge */}
            <mesh position={[0, -0.05, 0]}>
              <boxGeometry args={[1.42, 0.04, 1.12]} />
              <meshStandardMaterial color="#14171c" roughness={0.9} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Primer / bead dispenser cabinet */}
      <group position={[2.4, 0, RACK_Z + 0.4]}>
        <mesh position={[0, 0.7, 0]} castShadow>
          <boxGeometry args={[0.8, 1.4, 0.7]} />
          <meshStandardMaterial color="#c3c9d1" metalness={0.2} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.5, 14]} />
          <meshStandardMaterial color="#1f2937" metalness={0.3} roughness={0.6} />
        </mesh>
      </group>
    </MachineShell>
  )
}
