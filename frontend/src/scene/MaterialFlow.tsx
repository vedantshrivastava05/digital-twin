import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { categoryOf, useFactoryStore } from '../store'
import type { TwinDto } from '../types'
import { CAMPUS_BY_ID } from './campusLayout'
import { plantFlow } from './lineClock'
import { SHOP_LEAD, colorForBody } from './paintQueue'
import { biwGeometry } from './BodyInWhite'
import { CarBody } from './CarBody'

type PartKind = 'blank' | 'biw' | 'painted' | 'parts' | 'coil' | 'engine' | 'car'

interface Segment {
  id: string
  from: string // building id
  to: string // building id
  a: [number, number]
  b: [number, number]
  kind: PartKind
}

const PART_COLOR: Record<PartKind, string> = {
  blank: '#c8d0dc',
  biw: '#9aa3b2',
  painted: '#2563eb',
  parts: '#b58a55',
  coil: '#b8bfca',
  engine: '#37414f',
  car: '#dfe4ea',
}

/** Edge points + lanes for the transfer corridors between shops. */
function buildSegments(): Segment[] {
  const stamp = CAMPUS_BY_ID['nd-hall-stamp']
  const body = CAMPUS_BY_ID['nd-hall-a']
  const paint = CAMPUS_BY_ID['nd-hall-paint']
  const wh = CAMPUS_BY_ID['nd-hall-wh']
  const power = CAMPUS_BY_ID['nd-hall-power']
  const ga = CAMPUS_BY_ID['nd-hall-ga']
  const check = CAMPUS_BY_ID['nd-hall-check']
  const segs: Segment[] = []
  if (stamp && body)
    // The framing cell at the stamping east end joins panels into a body-in-white,
    // which then rides the rail straight to the weld shop.
    segs.push({
      id: 'stamp-body',
      from: stamp.id,
      to: body.id,
      a: [stamp.x + stamp.halfX, 0],
      b: [body.x - body.halfX, 0],
      kind: 'biw',
    })
  if (body && paint) {
    segs.push({
      id: 'body-paint',
      from: body.id,
      to: paint.id,
      a: [body.x + body.halfX, 0],
      b: [paint.x - paint.halfX, 0],
      kind: 'biw',
    })
  }
  // Painted bodies flow FORWARD to General Assembly, staying on the one spine
  // rail: straight through the Powertrain hall (in the west gate, out the east).
  if (paint && ga) {
    segs.push({
      id: 'paint-ga',
      from: paint.id,
      to: ga.id,
      a: [paint.x + paint.halfX, 0],
      b: [ga.x - ga.halfX, 0],
      kind: 'painted',
    })
  }
  // Out of General Assembly the car is finished, so it leaves under its own
  // wheels — driven down the link road to the final-check hall.
  if (ga && check) {
    segs.push({
      id: 'ga-check',
      from: ga.id,
      to: check.id,
      a: [ga.x + ga.halfX, 0],
      b: [check.x - check.halfX, 0],
      kind: 'car',
    })
  }
  // Passed cars drive out of the check hall's east door down the drive-out lane
  // to the marshalling yard. Both ends are the check hall, so the lane runs
  // whenever inspection is running.
  if (check) {
    segs.push({
      id: 'check-yard',
      from: check.id,
      to: check.id,
      a: [check.x + check.halfX, 0],
      b: [check.x + check.halfX + 26, 0],
      kind: 'car',
    })
  }
  // Powertrain feeds engines to General Assembly for the marriage station.
  if (power && ga) {
    segs.push({
      id: 'power-ga',
      from: power.id,
      to: ga.id,
      a: [power.x + power.halfX, 6],
      b: [ga.x - ga.halfX, 6],
      kind: 'engine',
    })
  }
  // Storage feeds ONLY the stamping shop: raw coils travel an L-shaped corridor
  // from the warehouse west edge, west along z = warehouse line, then south down
  // to the stamping shop's north wall.
  if (wh && stamp) {
    const cornerX = stamp.x
    const zLine = wh.z
    segs.push({
      id: 'wh-stamp-a',
      from: wh.id,
      to: stamp.id,
      a: [wh.x - wh.halfX, zLine],
      b: [cornerX, zLine],
      kind: 'coil',
    })
    segs.push({
      id: 'wh-stamp-b',
      from: wh.id,
      to: stamp.id,
      a: [cornerX, zLine],
      b: [cornerX, stamp.z + stamp.halfD],
      kind: 'coil',
    })
  }
  return segs
}

function Carrier({ kind, seq }: { kind: PartKind; seq: number }) {
  const biw = useMemo(() => biwGeometry(), [])
  // Painted shells and finished cars carry their order's colour between shops.
  const custom =
    kind === 'painted'
      ? colorForBody(seq + SHOP_LEAD.assembly)
      : kind === 'car'
        ? colorForBody(seq + SHOP_LEAD.check)
        : null
  // Car-body shells (bare BIW + painted) ride a full-length skid sized to match
  // the body-line cars exactly; coils / parts / engines ride a compact deck.
  const isBody = kind === 'biw' || kind === 'painted' || kind === 'blank'
  const deckZ = isBody ? 4.2 : 1.3
  const wheelZ = isBody ? 1.7 : 0.5

  // A finished car drives itself — no skid under it.
  if (kind === 'car') {
    return (
      <group position={[0, 0.07, 0]} rotation-y={-Math.PI / 2}>
        <CarBody color={custom ?? PART_COLOR.car} wheels />
      </group>
    )
  }

  return (
    <group>
      {/* Skid / AGV deck */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[2.0, 0.24, deckZ]} />
        <meshStandardMaterial color="#e0a021" metalness={0.3} roughness={0.5} />
      </mesh>
      {[-0.7, 0.7].map((x) =>
        [-wheelZ, wheelZ].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.08, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.1, 0.1, 0.1, 10]} />
            <meshStandardMaterial color="#1b1e24" />
          </mesh>
        )),
      )}
      {/* Carried part */}
      {kind === 'coil' ? (
        <group position={[0, 0.85, 0]} rotation-z={Math.PI / 2}>
          <mesh castShadow>
            <cylinderGeometry args={[0.62, 0.62, 1.3, 22]} />
            <meshStandardMaterial color={PART_COLOR[kind]} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.22, 0.22, 1.32, 12]} />
            <meshStandardMaterial color="#20242d" />
          </mesh>
        </group>
      ) : kind === 'parts' ? (
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[1.3, 0.6, 1.0]} />
          <meshStandardMaterial color={PART_COLOR[kind]} />
        </mesh>
      ) : kind === 'engine' ? (
        <group position={[0, 0.62, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.1, 0.6, 0.9]} />
            <meshStandardMaterial color={PART_COLOR[kind]} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <boxGeometry args={[0.85, 0.22, 0.72]} />
            <meshStandardMaterial color="#2a313d" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[-0.75, -0.05, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.32, 0.32, 0.5, 14]} />
            <meshStandardMaterial color="#42505f" metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      ) : (
        // Full-size car body (bare BIW or painted shell) — identical geometry
        // and scale to the cars on the body line so sizes match everywhere.
        <group position={[0, 0.26, 0]} rotation-y={-Math.PI / 2}>
          <mesh geometry={biw} castShadow>
            <meshStandardMaterial
              color={custom ?? (kind === 'painted' ? PART_COLOR.painted : '#aeb4bc')}
              metalness={kind === 'painted' ? 0.6 : 0.85}
              roughness={kind === 'painted' ? 0.35 : 0.42}
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

function FlowLane({ seg, factor }: { seg: Segment; factor: number }) {
  const carriers = useRef<(Group | null)[]>([])
  const factorRef = useRef(factor)
  factorRef.current = factor

  const dx = seg.b[0] - seg.a[0]
  const dz = seg.b[1] - seg.a[1]
  const len = Math.hypot(dx, dz)
  const count = Math.max(1, Math.round(len / 14))
  const angle = Math.atan2(dx, dz) // rotate carrier to face travel direction

  useFrame(() => {
    const base = (plantFlow.t * 0.04 * (0.2 + factorRef.current)) % 1
    carriers.current.forEach((c, i) => {
      if (!c) return
      const frac = (base + i / count) % 1
      c.position.x = seg.a[0] + dx * frac
      c.position.z = seg.a[1] + dz * frac
      c.visible = factorRef.current > 0
    })
  })

  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            carriers.current[i] = el
          }}
          rotation-y={angle}
        >
          <Carrier kind={seg.kind} seq={i} />
        </group>
      ))}
    </group>
  )
}

/** Cross-shop logistics: carrier parts travel the transfer corridors between
 *  buildings on the global plant-flow clock, paused/slowed when a shop is down. */
export function MaterialFlow({ twin }: { twin: TwinDto }) {
  const machines = useFactoryStore((s) => s.machines)
  const segments = useMemo(() => buildSegments(), [])

  const factors = useMemo(() => {
    const out: Record<string, number> = {}
    for (const b of Object.values(CAMPUS_BY_ID)) {
      const inside = twin.instances.filter(
        (i) =>
          Math.abs(i.x - b.x) <= b.halfX &&
          Math.abs(i.z - b.z) <= b.halfD &&
          categoryOf(twin, i) !== 'agv',
      )
      if (inside.length === 0) {
        out[b.id] = 0
        continue
      }
      const statuses = inside.map((i) => machines[i.id]?.status ?? 'idle')
      out[b.id] = statuses.some((s) => s === 'running')
        ? 1
        : statuses.some((s) => s === 'idle')
          ? 0.4
          : 0
    }
    return out
  }, [twin, machines])

  return (
    <group>
      {segments.map((seg) => (
        <FlowLane
          key={seg.id}
          seg={seg}
          factor={Math.min(factors[seg.from] ?? 0, factors[seg.to] ?? 0)}
        />
      ))}
    </group>
  )
}
