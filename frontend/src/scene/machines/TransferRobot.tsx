import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { useMachineRuntime } from '../../store'
import { CYCLE_SEC, STAMP_LINE_ID, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const STEEL = '#5b6577'
const FRAME = '#3f4a5e'
const BLANK = '#c8d0dc'
// NIPPON-style transfer tooling: bright caution yellow crossbar + tongs.
const TONG_YELLOW = '#e8b21e'
const TONG_YELLOW_DK = '#b8860c'

const XL = -7 // pick side (upstream press exit)
const XR = 7 // place side (downstream press entry)
const RAIL_Y = 4.3
const MOVE_FRAC = 2 / 7

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

/**
 * Press-to-press crossbar transfer feeder: a carriage rides an overhead rail
 * between two presses. On each line index it slides the vacuum crossbar (with
 * the panel) from the upstream press to the downstream one, then returns empty
 * during the dwell while the presses stroke. Synced to the shared stamp clock.
 */
export function TransferRobot({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(STAMP_LINE_ID)
  const carriage = useRef<Group>(null)
  const panel = useRef<Group>(null)

  useFrame(() => {
    if (status === 'down') return
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1
    let x: number
    let carrying: boolean
    if (f < MOVE_FRAC) {
      // Index: carry the panel downstream.
      const p = smoothstep(f / MOVE_FRAC)
      x = XL + (XR - XL) * p
      carrying = true
    } else {
      // Dwell: release and travel back empty to pick the next part.
      const q = (f - MOVE_FRAC) / (1 - MOVE_FRAC)
      x = XR + (XL - XR) * smoothstep(q)
      carrying = false
    }
    if (carriage.current) carriage.current.position.x = x
    if (panel.current) panel.current.visible = carrying
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[0, 0.1, 1.1]}
      labelY={5.2}
      noPlinth
    >
      {/* Runway posts at the two press faces */}
      {[XL - 0.5, XR + 0.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <boxGeometry args={[1.0, 0.16, 1.0]} />
            <meshStandardMaterial color="#aeb6c2" />
          </mesh>
          <mesh position={[0, RAIL_Y / 2, 0]} castShadow>
            <boxGeometry args={[0.34, RAIL_Y, 0.34]} />
            <meshStandardMaterial color={FRAME} metalness={0.35} roughness={0.55} />
          </mesh>
        </group>
      ))}
      {/* Overhead runway rail */}
      <mesh position={[0, RAIL_Y + 0.05, 0]} castShadow>
        <boxGeometry args={[XR - XL + 2.2, 0.28, 0.4]} />
        <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Travelling carriage + hanging yellow NIPPON tong tooling */}
      <group ref={carriage} position={[XL, RAIL_Y, 0]}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[1.1, 0.5, 0.7]} />
          <meshStandardMaterial color={TONG_YELLOW} metalness={0.3} roughness={0.5} />
        </mesh>
        {/* Twin signal stack lights on the carriage (NIPPON tooling telltale) */}
        {[-0.32, 0.32].map((sx) => (
          <group key={sx} position={[sx, 0.3, 0.28]}>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.28, 6]} />
              <meshStandardMaterial color="#333a45" />
            </mesh>
            {[
              { c: '#22c55e', y: 0.34 },
              { c: '#eab308', y: 0.46 },
              { c: '#ef4444', y: 0.58 },
            ].map((l) => (
              <mesh key={l.c} position={[0, l.y, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.1, 10]} />
                <meshStandardMaterial
                  color={l.c}
                  emissive={l.c}
                  emissiveIntensity={l.c === '#22c55e' && status === 'running' ? 1.8 : 0.15}
                />
              </mesh>
            ))}
          </group>
        ))}
        {/* Telescoping mast down to the crossbar */}
        <mesh position={[0, -1.1, 0]}>
          <boxGeometry args={[0.28, 1.9, 0.28]} />
          <meshStandardMaterial color={TONG_YELLOW_DK} metalness={0.35} roughness={0.5} />
        </mesh>
        {/* Yellow vacuum crossbar (tong beam) */}
        <mesh position={[0, -2.15, 0]} castShadow>
          <boxGeometry args={[1.7, 0.18, 0.28]} />
          <meshStandardMaterial color={TONG_YELLOW} metalness={0.35} roughness={0.45} />
        </mesh>
        <mesh position={[0, -2.15, 0]} castShadow>
          <boxGeometry args={[0.28, 0.18, 1.7]} />
          <meshStandardMaterial color={TONG_YELLOW} metalness={0.35} roughness={0.45} />
        </mesh>
        {/* Four suction tongs: yellow arm + bellows + rubber cup */}
        {[-0.6, 0.6].map((cx) =>
          [-0.6, 0.6].map((cz) => (
            <group key={`${cx}:${cz}`} position={[cx, -2.24, cz]}>
              <mesh>
                <boxGeometry args={[0.1, 0.18, 0.1]} />
                <meshStandardMaterial color={TONG_YELLOW_DK} metalness={0.3} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.16, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.12, 10]} />
                <meshStandardMaterial color="#1b1f27" />
              </mesh>
              <mesh position={[0, -0.26, 0]}>
                <cylinderGeometry args={[0.15, 0.09, 0.1, 14]} />
                <meshStandardMaterial color="#2a2f38" roughness={0.85} />
              </mesh>
            </group>
          )),
        )}
        {/* Panel held by the tongs (only while carrying) */}
        <group ref={panel} position={[0, -2.42, 0]}>
          <mesh rotation-x={-Math.PI / 2} castShadow>
            <planeGeometry args={[1.4, 1.15]} />
            <meshStandardMaterial color={BLANK} metalness={0.6} roughness={0.35} side={2} />
          </mesh>
        </group>
      </group>
    </MachineShell>
  )
}
