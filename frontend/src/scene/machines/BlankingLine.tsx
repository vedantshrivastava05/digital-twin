import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { cycleInfo, getLineClock, STAMP_LINE_ID } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const FRAME = '#3f4a5e'
const STEEL = '#5b6577'
const COIL = '#7c8797'
const BLANK = '#c8d0dc'

const N_BLANKS = 3
const FEED0 = 2.0 // where a cut blank leaves the destacker
const FEED1 = 6.3 // toward the first press (+x = downstream)

/**
 * Coil blanking line — the head of the press shop and the line pacer. An
 * uncoiler reel feeds sheet through a straightener into a blanking press that
 * cuts flat blanks, which index out on the destacker toward press 1. This
 * component owns the shared stamping clock; presses + transfer robots read it.
 */
export function BlankingLine({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(STAMP_LINE_ID)
  const reel = useRef<Mesh>(null)
  const ram = useRef<Mesh>(null)
  const blanks = useRef<(Group | null)[]>([])

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    clock.t += dt * s
    const { step, moveEase } = cycleInfo(clock.t)

    if (reel.current) reel.current.rotation.y += dt * s * 0.6

    // Blanking ram strokes with the dwell (same window as the presses).
    const f = (((clock.t / 7) % 1) + 1) % 1
    const strokeDown = f > 0.38 && f < 0.95 ? Math.sin(((f - 0.38) / 0.57) * Math.PI) : 0
    if (ram.current) ram.current.position.y = 2.75 - strokeDown * 0.6

    // Cut blanks index out toward the press line, one station per cycle.
    blanks.current.forEach((b, i) => {
      if (!b) return
      const frac = ((i + step + moveEase) % N_BLANKS) / N_BLANKS
      b.position.x = FEED0 + frac * (FEED1 - FEED0)
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, asset.footprint_d / 2 - 0.3]}
      labelY={3.6}
    >
      {/* Uncoiler reel + mandrel (coil of sheet steel) */}
      <group position={[-5, 1.75, 0]} rotation-x={Math.PI / 2}>
        <mesh ref={reel} castShadow>
          <cylinderGeometry args={[1.15, 1.15, 1.3, 28]} />
          <meshStandardMaterial color={COIL} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.4, 0.4, 1.3, 20]} />
          <meshStandardMaterial color="#20242d" />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.12, 0.12, 2.4, 12]} />
          <meshStandardMaterial color="#3b4250" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      {/* Mandrel support stand */}
      <mesh position={[-5, 0.85, 0]} castShadow>
        <boxGeometry args={[0.6, 1.7, 2.6]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      {/* Straightener / leveler housing + top rollers */}
      <mesh position={[-2.4, 1.0, 0]} castShadow>
        <boxGeometry args={[1.6, 1.4, 2.3]} />
        <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.55} />
      </mesh>
      {[-0.5, 0, 0.5].map((dx) => (
        <mesh key={dx} position={[-2.4 + dx, 1.78, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.16, 0.16, 2.1, 12]} />
          <meshStandardMaterial color="#8b96a8" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* Sheet strip feeding from the straightener into the blanking press */}
      <mesh position={[-1.0, 1.06, 0]} castShadow>
        <boxGeometry args={[3.2, 0.05, 1.3]} />
        <meshStandardMaterial color={BLANK} metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Blanking press (small C-frame) */}
      <mesh position={[0.9, 0.55, 0]} castShadow>
        <boxGeometry args={[2.0, 1.1, 2.2]} />
        <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.6} />
      </mesh>
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[0.9 + x, 2.1, 0]} castShadow>
          <boxGeometry args={[0.32, 2.0, 1.9]} />
          <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      <mesh position={[0.9, 3.2, 0]} castShadow>
        <boxGeometry args={[2.2, 0.6, 2.1]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>
      <mesh ref={ram} position={[0.9, 2.75, 0]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1.8]} />
        <meshStandardMaterial color="#8b96a8" metalness={0.4} roughness={0.45} />
      </mesh>

      {/* Destacker exit table */}
      <mesh position={[4.2, 0.45, 0]} castShadow>
        <boxGeometry args={[4.6, 0.9, 1.7]} />
        <meshStandardMaterial color={STEEL} metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Cut blanks indexing out toward press 1 */}
      {Array.from({ length: N_BLANKS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            blanks.current[i] = el
          }}
          position={[FEED0, 1.02, 0]}
        >
          <mesh rotation-x={-Math.PI / 2} castShadow>
            <planeGeometry args={[1.3, 1.1]} />
            <meshStandardMaterial color={BLANK} metalness={0.6} roughness={0.35} side={2} />
          </mesh>
        </group>
      ))}
    </MachineShell>
  )
}
