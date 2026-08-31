import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { useMachineRuntime } from '../../store'
import { CYCLE_SEC, GA_LINE_ID, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const BASE_Z = 3.2
const SEAT_Y = 1.6

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** One articulated arm that reaches through the door aperture with a seat. */
function SeatArm({
  side,
  armRef,
  seatColor,
}: {
  side: number
  armRef: (el: Group | null) => void
  seatColor: string
}) {
  return (
    <group position={[0, 0, side * BASE_Z]} rotation-y={side > 0 ? Math.PI : 0}>
      {/* Pedestal + waist casting */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.72, 0.56, 18]} />
        <meshStandardMaterial color="#1b1f26" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.56, 0.7, 18]} />
        <meshStandardMaterial color="#e8b21e" metalness={0.35} roughness={0.5} />
      </mesh>
      {/* Swinging boom carrying the seat gripper */}
      <group ref={armRef} position={[0, 1.2, 0]}>
        <mesh position={[0, 0.35, -0.6]} rotation-x={0.5} castShadow>
          <boxGeometry args={[0.42, 1.7, 0.42]} />
          <meshStandardMaterial color="#e8b21e" metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.85, -1.55]} castShadow>
          <boxGeometry args={[0.34, 0.34, 1.5]} />
          <meshStandardMaterial color="#d9a417" metalness={0.35} roughness={0.5} />
        </mesh>
        {/* Gripper frame + the seat itself */}
        <group position={[0, 0.6, -2.3]}>
          <mesh castShadow>
            <boxGeometry args={[0.7, 0.14, 0.5]} />
            <meshStandardMaterial color="#3d444e" metalness={0.4} roughness={0.5} />
          </mesh>
          <group position={[0, -0.35, 0]}>
            {/* Seat squab */}
            <mesh castShadow>
              <boxGeometry args={[0.62, 0.16, 0.6]} />
              <meshStandardMaterial color={seatColor} roughness={0.85} />
            </mesh>
            {/* Backrest */}
            <mesh position={[0, 0.34, -0.24]} rotation-x={-0.16} castShadow>
              <boxGeometry args={[0.6, 0.68, 0.14]} />
              <meshStandardMaterial color={seatColor} roughness={0.85} />
            </mesh>
            {/* Head restraint */}
            <mesh position={[0, 0.74, -0.28]}>
              <boxGeometry args={[0.28, 0.2, 0.13]} />
              <meshStandardMaterial color={seatColor} roughness={0.85} />
            </mesh>
            {/* Protective cover, as they run on the real line */}
            <mesh position={[0, 0.12, 0.02]}>
              <boxGeometry args={[0.66, 0.5, 0.64]} />
              <meshStandardMaterial
                color="#f1f5f9"
                transparent
                opacity={0.28}
                roughness={0.95}
              />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/**
 * Seat installation station: a robot each side takes a seat off the feed
 * conveyor and reaches in through the open door aperture to set it on the floor
 * pan. Sequenced to the GA line so it loads during the dwell.
 */
export function SeatStation({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(GA_LINE_ID)
  const booms = useRef<(Group | null)[]>([])
  const feed = useRef<(Group | null)[]>([])

  useFrame((_, dt) => {
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1
    // reach in (0.25-0.55) -> release (0.55-0.65) -> withdraw (0.65-0.95)
    const inward = smoothstep((f - 0.25) / 0.3) - smoothstep((f - 0.65) / 0.3)
    booms.current.forEach((b, i) => {
      if (!b) return
      const lead = i === 0 ? inward : Math.max(0, inward - 0.12)
      b.rotation.y = -lead * 0.62
      b.position.y = 1.2 + lead * (SEAT_Y - 1.2)
    })
    // Seats creep along the feed conveyor toward the pick point.
    feed.current.forEach((g) => {
      if (!g) return
      g.position.x = ((g.position.x + dt * 0.35 + 3) % 6) - 3
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, 4.4]}
      labelY={3.8}
      noPlinth
    >
      {/* Seat feed conveyors behind each robot */}
      {[1, -1].map((side, si) => (
        <group key={side} position={[0, 0, side * (BASE_Z + 2.1)]}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <boxGeometry args={[6.2, 0.18, 1.1]} />
            <meshStandardMaterial color="#4b535c" metalness={0.4} roughness={0.55} />
          </mesh>
          {[-2.8, 0, 2.8].map((x) => (
            <mesh key={x} position={[x, 0.28, 0]}>
              <boxGeometry args={[0.16, 0.55, 0.9]} />
              <meshStandardMaterial color="#3a4048" />
            </mesh>
          ))}
          {[0, 1].map((k) => (
            <group
              key={k}
              ref={(el) => {
                feed.current[si * 2 + k] = el
              }}
              position={[k * 3 - 1.5, 0.86, 0]}
            >
              <mesh castShadow>
                <boxGeometry args={[0.62, 0.16, 0.6]} />
                <meshStandardMaterial color="#26282d" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.34, -0.24]} rotation-x={-0.16} castShadow>
                <boxGeometry args={[0.6, 0.68, 0.14]} />
                <meshStandardMaterial color="#26282d" roughness={0.85} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* The two loading robots */}
      {[1, -1].map((side, i) => (
        <SeatArm
          key={side}
          side={side}
          seatColor={i === 0 ? '#26282d' : '#2c2f36'}
          armRef={(el) => {
            booms.current[i] = el
          }}
        />
      ))}
    </MachineShell>
  )
}
