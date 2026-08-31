import { useMemo } from 'react'
import { useFactoryStore } from '../store'
import { CAMPUS_BY_ID } from './campusLayout'
import { colorForBody } from './paintQueue'

/**
 * Shipping end of the plant: cars that pass final check drive out of the east
 * door, down the drive-out lane, and are parked in the marshalling yard in
 * colour blocks until a transporter loads them.
 *
 * This is scenery rather than plant equipment, so it lives outside the building
 * groups and follows the `dressing` layer toggle.
 */

const APRON_HALF_X = 58
const APRON_HALF_Z = 52
/** Bay pitch: cars park nose-in, 2.6 m wide, 5.6 m deep rows back to back. */
const BAY_W = 2.6
const ROW_D = 5.8

/**
 * Lightweight parked car: at yard viewing distance a body, cabin and a wheel
 * strip per side read correctly, and it costs a fraction of the full body.
 */
function ParkedCar({
  position,
  rotation = 0,
  color,
}: {
  position: [number, number, number]
  rotation?: number
  color: string
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[4.1, 0.7, 1.75]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[-0.2, 1.06, 0]} castShadow>
        <boxGeometry args={[2.0, 0.42, 1.55]} />
        <meshStandardMaterial color="#1a1f27" metalness={0.2} roughness={0.25} />
      </mesh>
      <mesh position={[-0.2, 1.3, 0]}>
        <boxGeometry args={[1.7, 0.08, 1.5]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} />
      </mesh>
      {[0.9, -0.9].map((z) => (
        <mesh key={z} position={[0, 0.24, z]}>
          <boxGeometry args={[3.2, 0.44, 0.14]} />
          <meshStandardMaterial color="#15181e" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** A block of nose-in bays with cars in them, plus the painted bay lines. */
function MarshallingBlock({
  x,
  z,
  bays,
  rows,
  seed,
}: {
  x: number
  z: number
  bays: number
  rows: number
  seed: number
}) {
  const width = bays * BAY_W
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: rows }, (_, r) => (
        <group key={r} position={[0, 0, r * ROW_D]}>
          {/* Bay divider lines */}
          {Array.from({ length: bays + 1 }, (_, i) => (
            <mesh
              key={i}
              rotation-x={-Math.PI / 2}
              position={[0, 0.01, -width / 2 + i * BAY_W]}
            >
              <planeGeometry args={[ROW_D - 0.9, 0.14]} />
              <meshBasicMaterial color="#dfe4ea" />
            </mesh>
          ))}
          {/* Head-of-bay kerb line */}
          <mesh rotation-x={-Math.PI / 2} position={[-(ROW_D - 0.9) / 2, 0.01, 0]}>
            <planeGeometry args={[0.16, width]} />
            <meshBasicMaterial color="#dfe4ea" />
          </mesh>
          {Array.from({ length: bays }, (_, b) => (
            <ParkedCar
              key={b}
              position={[0.1, 0, -width / 2 + BAY_W / 2 + b * BAY_W]}
              color={colorForBody(seed + r * 3 + b)}
            />
          ))}
        </group>
      ))}
    </group>
  )
}

/** Yard flood-light mast. */
function LightMast({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 6, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 12, 10]} />
        <meshStandardMaterial color="#6b7280" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 12.1, 0]}>
        <boxGeometry args={[2.4, 0.18, 0.7]} />
        <meshStandardMaterial color="#4a5260" metalness={0.4} roughness={0.6} />
      </mesh>
      {[-0.8, 0, 0.8].map((dx) => (
        <mesh key={dx} position={[dx, 11.85, 0]} rotation-x={0.35}>
          <boxGeometry args={[0.6, 0.14, 0.5]} />
          <meshStandardMaterial color="#fff6dd" emissive="#ffeeba" emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  )
}

/** Double-deck car transporter waiting at the loading edge. */
function Transporter({
  position,
  rotation = 0,
  seed,
}: {
  position: [number, number, number]
  rotation?: number
  seed: number
}) {
  return (
    <group position={position} rotation-y={rotation}>
      {/* Tractor unit */}
      <mesh position={[7.8, 1.5, 0]} castShadow>
        <boxGeometry args={[3.2, 2.4, 2.5]} />
        <meshStandardMaterial color="#1e40af" metalness={0.4} roughness={0.45} />
      </mesh>
      <mesh position={[7.4, 2.9, 0]}>
        <boxGeometry args={[2.2, 0.5, 2.4]} />
        <meshStandardMaterial color="#1e40af" metalness={0.4} roughness={0.45} />
      </mesh>
      {/* Trailer decks */}
      {[1.1, 3.5].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[15, 0.16, 2.6]} />
          <meshStandardMaterial color="#7c8797" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* Deck posts */}
      {[-7, -2.4, 2.4, 7].map((x) => (
        <mesh key={x} position={[x, 2.4, 0]}>
          <boxGeometry args={[0.18, 2.6, 2.5]} />
          <meshStandardMaterial color="#5b6371" metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
      {/* Wheels */}
      {[-6, -4.4, 6.6, 8.4].map((x) =>
        [1.2, -1.2].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.55, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.55, 0.55, 0.34, 12]} />
            <meshStandardMaterial color="#14181f" roughness={0.9} />
          </mesh>
        )),
      )}
      {/* Loaded cars, two per deck */}
      {[
        [1.32, -3.6],
        [1.32, 3.2],
        [3.72, -3.6],
        [3.72, 3.2],
      ].map(([y, x], i) => (
        <ParkedCar key={i} position={[x, y, 0]} color={colorForBody(seed + i * 2)} />
      ))}
    </group>
  )
}

/** Yard perimeter: kerb, mesh fence and gate posts on the outer edges. */
function YardFence({ cx }: { cx: number }) {
  const posts = useMemo(
    () => Array.from({ length: 13 }, (_, i) => -APRON_HALF_X + 4 + i * 9),
    [],
  )
  return (
    <group position={[cx, 0, 0]}>
      {[-APRON_HALF_Z, APRON_HALF_Z].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[APRON_HALF_X * 2, 0.24, 0.4]} />
            <meshStandardMaterial color="#9aa2ac" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.35, 0]}>
            <planeGeometry args={[APRON_HALF_X * 2, 2.2]} />
            <meshStandardMaterial
              color="#8d97a3"
              transparent
              opacity={0.35}
              roughness={0.8}
              metalness={0.3}
            />
          </mesh>
          {posts.map((x) => (
            <mesh key={x} position={[x, 1.25, 0]}>
              <boxGeometry args={[0.12, 2.5, 0.12]} />
              <meshStandardMaterial color="#6b7280" metalness={0.35} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {/* East end fence with the gate gap in the middle */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[APRON_HALF_X, 1.35, s * (APRON_HALF_Z / 2 + 5)]}
          rotation-y={Math.PI / 2}
        >
          <planeGeometry args={[APRON_HALF_Z - 10, 2.2]} />
          <meshStandardMaterial
            color="#8d97a3"
            transparent
            opacity={0.35}
            roughness={0.8}
            metalness={0.3}
          />
        </mesh>
      ))}
    </group>
  )
}

export function ShippingYard() {
  const showDressing = useFactoryStore((s) => s.layers.dressing)
  const check = CAMPUS_BY_ID['nd-hall-check']
  if (!check || !showDressing) return null

  // Yard sits east of the final-check hall, fed by a drive-out lane from its
  // east door.
  const laneStart = check.x + check.halfX
  const yardX = laneStart + 26 + APRON_HALF_X

  return (
    <group>
      {/* Yard apron */}
      <mesh rotation-x={-Math.PI / 2} position={[yardX, -0.04, 0]} receiveShadow>
        <planeGeometry args={[APRON_HALF_X * 2, APRON_HALF_Z * 2]} />
        <meshStandardMaterial color="#474d55" roughness={0.97} />
      </mesh>

      {/* Drive-out lane from the check hall east door into the yard */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[laneStart + 13, -0.03, 0]}
        receiveShadow
      >
        <planeGeometry args={[26, 9]} />
        <meshStandardMaterial color="#53585f" roughness={0.95} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          rotation-x={-Math.PI / 2}
          position={[laneStart + 2 + i * 3.6, -0.02, 0]}
        >
          <planeGeometry args={[2, 0.24]} />
          <meshBasicMaterial color="#d9c24a" />
        </mesh>
      ))}
      {/* Yard entry lane running down the middle of the marshalling blocks */}
      <mesh rotation-x={-Math.PI / 2} position={[yardX, -0.03, 0]}>
        <planeGeometry args={[APRON_HALF_X * 2, 9]} />
        <meshStandardMaterial color="#53585f" roughness={0.95} />
      </mesh>

      <YardFence cx={yardX} />

      {/* Marshalling blocks north and south of the entry lane */}
      <MarshallingBlock x={yardX - 34} z={-13} bays={7} rows={2} seed={0} />
      <MarshallingBlock x={yardX - 34} z={13} bays={7} rows={2} seed={3} />
      <MarshallingBlock x={yardX + 6} z={-13} bays={7} rows={2} seed={5} />
      <MarshallingBlock x={yardX + 6} z={13} bays={7} rows={2} seed={2} />

      {/* Transporters loading at the east gate */}
      <Transporter position={[yardX + 34, 0, -32]} seed={1} />
      <Transporter position={[yardX + 34, 0, 32]} seed={4} />

      {/* Flood-light masts on the yard corners */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <LightMast
            key={`${sx}:${sz}`}
            position={[yardX + sx * (APRON_HALF_X - 6), 0, sz * (APRON_HALF_Z - 6)]}
          />
        )),
      )}
    </group>
  )
}
