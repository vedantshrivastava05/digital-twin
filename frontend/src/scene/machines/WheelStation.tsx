import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { GA_LINE_ID, cycleInfo, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const HUB_Y = 1.05
/** Where the presenter parks (outboard) and where it presents (at the hub). */
const PARK_Z = 2.75
const FIT_Z = 1.15
/** Front and rear hub positions along the line. */
const HUB_X = [1.25, -1.25]

/**
 * Wheel fitting station: a balanced presenter arm each side lifts a wheel off
 * the gravity chute, swings it square to the hub and a multi-spindle nut runner
 * torques all the nuts in one shot. Sequenced to the GA line dwell.
 */
export function WheelStation({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(GA_LINE_ID)
  const arms = useRef<(Group | null)[]>([])
  const runners = useRef<(Group | null)[]>([])
  const work = useRef(0)

  useFrame((_, dt) => {
    const { welding: dwell } = cycleInfo(clock.t)
    const target = status === 'down' ? 0 : dwell ? 1 : 0
    work.current += (target - work.current) * Math.min(1, dt * (3 + statusSpeed(status)))
    const w = work.current
    arms.current.forEach((a, i) => {
      if (!a) return
      const side = i % 2 === 0 ? 1 : -1
      a.position.z = side * (PARK_Z - (PARK_Z - FIT_Z) * w)
      a.position.y = HUB_Y * (0.55 + 0.45 * w)
    })
    // Nut runners only spin once the wheel is up against the hub.
    const spin = w > 0.85 ? 1 : 0
    runners.current.forEach((r) => {
      if (r) r.rotation.z += dt * spin * 14
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, 3.4]}
      labelY={3.6}
      noPlinth
    >
      {/* Overhead rail the presenters are balanced from */}
      {[1, -1].map((side) => (
        <group key={side} position={[0, 0, side * PARK_Z]}>
          <mesh position={[0, 2.9, 0]} castShadow>
            <boxGeometry args={[5.4, 0.16, 0.16]} />
            <meshStandardMaterial color="#8f979f" metalness={0.45} roughness={0.45} />
          </mesh>
          {[-2.5, 2.5].map((x) => (
            <mesh key={x} position={[x, 1.45, 0]} castShadow>
              <boxGeometry args={[0.16, 2.9, 0.16]} />
              <meshStandardMaterial color="#8f979f" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
          {/* Gravity chute feeding tyres from the line-side stock */}
          <group position={[0, 0, side * 1.1]}>
            <mesh position={[0, 0.62, 0]} rotation-x={side * 0.14} castShadow>
              <boxGeometry args={[4.6, 0.1, 0.9]} />
              <meshStandardMaterial color="#4b535c" metalness={0.4} roughness={0.55} />
            </mesh>
            {[-1.7, -0.55, 0.6, 1.75].map((x) => (
              <group key={x} position={[x, 0.95, 0]} rotation-y={Math.PI / 2}>
                <mesh rotation-x={Math.PI / 2} castShadow>
                  <cylinderGeometry args={[0.33, 0.33, 0.24, 20]} />
                  <meshStandardMaterial color="#17181c" roughness={0.85} />
                </mesh>
                <mesh rotation-x={Math.PI / 2}>
                  <cylinderGeometry args={[0.19, 0.19, 0.26, 16]} />
                  <meshStandardMaterial color="#9aa2ac" metalness={0.7} roughness={0.35} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}

      {/* Two presenters per side (front + rear hub) */}
      {HUB_X.map((hx, hi) =>
        [1, -1].map((side, si) => {
          const idx = hi * 2 + si
          return (
            <group
              key={`${hx}:${side}`}
              ref={(el) => {
                arms.current[idx] = el
              }}
              position={[hx, HUB_Y, side * PARK_Z]}
            >
              {/* Balancer drop from the overhead rail */}
              <mesh position={[0, 1.5, 0]}>
                <boxGeometry args={[0.09, 3.0, 0.09]} />
                <meshStandardMaterial color="#5b6371" metalness={0.4} roughness={0.5} />
              </mesh>
              {/* Blue tooling plate that carries the wheel */}
              <mesh castShadow>
                <boxGeometry args={[0.85, 0.5, 0.16]} />
                <meshStandardMaterial color="#1d4ed8" metalness={0.35} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.34, 0]}>
                <boxGeometry args={[0.5, 0.2, 0.5]} />
                <meshStandardMaterial color="#2a313d" metalness={0.4} roughness={0.5} />
              </mesh>
              {/* The wheel being presented */}
              <group position={[0, 0, side * -0.34]} rotation-y={Math.PI / 2}>
                <mesh rotation-x={Math.PI / 2} castShadow>
                  <cylinderGeometry args={[0.33, 0.33, 0.24, 20]} />
                  <meshStandardMaterial color="#17181c" roughness={0.85} />
                </mesh>
                <mesh rotation-x={Math.PI / 2}>
                  <cylinderGeometry args={[0.19, 0.19, 0.26, 16]} />
                  <meshStandardMaterial color="#9aa2ac" metalness={0.7} roughness={0.35} />
                </mesh>
              </group>
              {/* Multi-spindle nut runner behind the wheel */}
              <group
                ref={(el) => {
                  runners.current[idx] = el
                }}
                position={[0, 0, side * 0.3]}
              >
                {[0, 1, 2, 3].map((s) => {
                  const a = (s / 4) * Math.PI * 2
                  return (
                    <mesh
                      key={s}
                      position={[Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0]}
                      rotation-x={Math.PI / 2}
                    >
                      <cylinderGeometry args={[0.045, 0.045, 0.42, 8]} />
                      <meshStandardMaterial color="#d1d5db" metalness={0.7} roughness={0.35} />
                    </mesh>
                  )
                })}
                <mesh rotation-x={Math.PI / 2}>
                  <cylinderGeometry args={[0.24, 0.24, 0.2, 14]} />
                  <meshStandardMaterial color="#f8fafc" metalness={0.2} roughness={0.6} />
                </mesh>
              </group>
            </group>
          )
        }),
      )}
    </MachineShell>
  )
}
