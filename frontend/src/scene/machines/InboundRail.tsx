import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const RAIL = '#3a4150'
const RAIL_HI = '#4a5260'
const STEEL = '#6b7280'
const GATE_FRAME = '#c9a227'
const CRATE = ['#b58a55', '#c79a63', '#9aa3b2']

// Local Z layout (seed rot=0, so local == world axes; warehouse north wall is at
// world z=137, rail seeded at z=128 -> wall is +9 in local Z):
const Z_TRUCK = 13 // rail mouth under the delivery truck, OUTSIDE the wall
const Z_GATE = 9 // the wall / gate plane
const Z_PILE = -9 // inside end where crates roll off to the receiving pile
const DECK_LEN = Z_TRUCK - Z_PILE // 22
const DECK_MID = (Z_TRUCK + Z_PILE) / 2
const RAIL_W = 1.6
const DECK_Y = 0.85
const GATE_HALF = 4.3 // half-width of the gate opening
const GATE_H = 8.2

/**
 * Inbound goods-in dock. A delivery truck is parked OUTSIDE the warehouse; a
 * powered roller rail runs from the truck bed, through a framed roll-up GATE in
 * the north wall, to the receiving pile inside. Crates ride the rail from the
 * truck end to the pile end continuously (a steady inbound feed), so you can see
 * boxes arriving from outside, passing through the gate, and building the pile.
 * Motion follows machine status (frozen when down).
 */
export function InboundRail({ instance, asset }: Props) {
  const boxes = useRef<Group>(null)
  const phase = useRef(0)
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'

  const rollerZs = useMemo(
    () =>
      Array.from({ length: Math.round(DECK_LEN / 1.1) }, (_, i) => Z_PILE + 0.55 + i * 1.1),
    [],
  )
  const count = 6
  const crateIdx = useMemo(() => Array.from({ length: count }, (_, i) => i), [])

  useFrame((_, dt) => {
    phase.current = (phase.current + dt * statusSpeed(status) * 0.045) % 1
    const kids = boxes.current?.children
    if (!kids) return
    kids.forEach((c, i) => {
      const frac = (phase.current + i / count) % 1
      c.position.z = Z_TRUCK - frac * DECK_LEN // truck end -> pile end
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[RAIL_W / 2 + 0.5, 0.1, Z_PILE + 0.6]}
      labelY={3.0}
    >
      {/* ---- Conveyor deck: side beams + legs + rollers ---- */}
      {[-RAIL_W / 2, RAIL_W / 2].map((x) => (
        <mesh key={x} position={[x, DECK_Y, DECK_MID]} castShadow>
          <boxGeometry args={[0.22, 0.5, DECK_LEN]} />
          <meshStandardMaterial color={RAIL} metalness={0.55} roughness={0.5} />
        </mesh>
      ))}
      {[Z_PILE + 1, DECK_MID, Z_TRUCK - 1].map((z) =>
        [-RAIL_W / 2, RAIL_W / 2].map((x) => (
          <mesh key={`${x}:${z}`} position={[x, DECK_Y / 2, z]} castShadow>
            <boxGeometry args={[0.16, DECK_Y, 0.16]} />
            <meshStandardMaterial color={RAIL_HI} metalness={0.4} roughness={0.6} />
          </mesh>
        )),
      )}
      {rollerZs.map((z) => (
        <mesh key={z} position={[0, DECK_Y + 0.12, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.13, 0.13, RAIL_W, 10]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* ---- Crates riding the rail from the truck to the pile ---- */}
      <group ref={boxes}>
        {crateIdx.map((i) => (
          <mesh key={i} position={[0, DECK_Y + 0.55, 0]} castShadow>
            <boxGeometry args={[1.15, 0.8, 1.0]} />
            <meshStandardMaterial color={CRATE[i % CRATE.length]} roughness={0.85} />
          </mesh>
        ))}
      </group>

      {/* ---- GATE: framed roll-up dock door in the wall ---- */}
      <group position={[0, 0, Z_GATE]}>
        {/* Jamb posts */}
        {[-GATE_HALF, GATE_HALF].map((x) => (
          <mesh key={x} position={[x, GATE_H / 2, 0]} castShadow>
            <boxGeometry args={[0.5, GATE_H, 0.6]} />
            <meshStandardMaterial color={GATE_FRAME} metalness={0.35} roughness={0.55} />
          </mesh>
        ))}
        {/* Header beam */}
        <mesh position={[0, GATE_H + 0.25, 0]} castShadow>
          <boxGeometry args={[GATE_HALF * 2 + 0.5, 0.6, 0.6]} />
          <meshStandardMaterial color={GATE_FRAME} metalness={0.35} roughness={0.55} />
        </mesh>
        {/* Rolled-up shutter drum (door is OPEN so the rail passes through) */}
        <mesh position={[0, GATE_H - 0.15, 0.05]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.55, 0.55, GATE_HALF * 2 - 0.2, 14]} />
          <meshStandardMaterial color="#43494f" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Hazard-striped reveal on the jambs */}
        {[-GATE_HALF, GATE_HALF].map((x) => (
          <mesh key={`r${x}`} position={[x + (x < 0 ? 0.28 : -0.28), GATE_H / 2, 0.31]}>
            <boxGeometry args={[0.06, GATE_H - 0.4, 0.04]} />
            <meshStandardMaterial color="#f4c542" emissive="#f4c542" emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>

      {/* Outside canopy over the dock */}
      <mesh position={[0, GATE_H + 0.55, Z_GATE + 2.6]} rotation-x={0.12} castShadow>
        <boxGeometry args={[GATE_HALF * 2 + 1.6, 0.16, 4.4]} />
        <meshStandardMaterial color="#5b6470" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Guide bollards flanking the opening (inside + outside) */}
      {[
        [-GATE_HALF - 0.9, Z_GATE - 1.2],
        [GATE_HALF + 0.9, Z_GATE - 1.2],
        [-GATE_HALF - 0.9, Z_GATE + 1.4],
        [GATE_HALF + 0.9, Z_GATE + 1.4],
      ].map(([bx, bz]) => (
        <group key={`${bx}:${bz}`} position={[bx, 0, bz]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.18, 1.0, 12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.16, 12]} />
            <meshStandardMaterial color="#26292f" />
          </mesh>
        </group>
      ))}

      {/* ---- Parked delivery truck outside, feeding the rail ---- */}
      <group position={[0, 0, Z_TRUCK + 3.5]}>
        {/* Trailer box (mouth toward the gate) */}
        <mesh position={[0, 1.95, 0]} castShadow>
          <boxGeometry args={[3.0, 2.9, 6.6]} />
          <meshStandardMaterial color="#c9ccd2" metalness={0.2} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[2.7, 0.4, 6.6]} />
          <meshStandardMaterial color="#2b3038" roughness={0.7} />
        </mesh>
        {/* Cab at the far (north) end */}
        <mesh position={[0, 1.6, 4.6]} castShadow>
          <boxGeometry args={[2.9, 2.3, 2.6]} />
          <meshStandardMaterial color="#2f6bd6" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 2.05, 5.92]}>
          <boxGeometry args={[2.6, 1.0, 0.1]} />
          <meshStandardMaterial color="#0e3a4a" emissive="#155e75" emissiveIntensity={0.5} />
        </mesh>
        {[
          [-1.45, 3.0],
          [1.45, 3.0],
          [-1.45, -0.6],
          [1.45, -0.6],
          [-1.45, -2.4],
          [1.45, -2.4],
        ].map(([wx, wz]) => (
          <mesh key={`${wx}:${wz}`} position={[wx, 0.6, wz]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.6, 0.6, 0.4, 16]} />
            <meshStandardMaterial color="#17191e" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </MachineShell>
  )
}
