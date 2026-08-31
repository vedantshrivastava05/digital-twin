import { useMemo } from 'react'
import {
  BoxGeometry,
  type BufferGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural factory hall, modelled on the reference photos: a curved steel
 * space-frame roof, translucent skylight bands, warm-white walls with ribbon
 * clerestory + office windows, personnel doors and big dark sectional doors on
 * the gables that link one shop to the next.
 *
 * Everything is thin box members, so each material group (steel / wall / glass
 * / slate) is welded into ONE merged BufferGeometry — the whole building is a
 * few draw calls. The steel space-frame is left open and the skylights are
 * translucent, so the machines stay visible straight through the roof from the
 * orbit camera (no cutaway needed).
 *
 * Every literal is now derived from props so the same component can build any
 * shop in the campus (Stamping / Body / Paint / Powertrain / Warehouse) just by
 * passing its footprint + door layout from the backend building `meta`.
 */

const UP = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)

export interface ShellDoors {
  /** Big sectional hangar door on the +X gable (toward the next shop). */
  east?: boolean
  /** Big sectional hangar door on the -X gable (toward the previous shop). */
  west?: boolean
  /** Big sectional door on the +Z long wall. */
  north?: boolean
  /** Big sectional door on the -Z long wall. */
  south?: boolean
  /** Which long wall carries the two office window ribbons (null = none). */
  office?: 'north' | 'south' | null
}

export interface FactoryShellProps {
  halfX?: number
  halfD?: number
  eavesY?: number
  ridgeY?: number
  archN?: number
  trussStep?: number
  doors?: ShellDoors
  wallColor?: string
  steelColor?: string
}

interface Cfg {
  halfX: number
  halfD: number
  eavesY: number
  ridgeY: number
  archN: number
  trussStep: number
  doors: ShellDoors
}

type P = [number, number, number]

const DEFAULTS: Cfg = {
  halfX: 49,
  halfD: 29,
  eavesY: 9,
  ridgeY: 13.5,
  archN: 12,
  trussStep: 5,
  doors: { east: true, office: 'south' },
}

/** Parabolic barrel-vault profile: EAVES at the walls, RIDGE at the centre. */
function archYAt(z: number, c: Cfg): number {
  return c.eavesY + (c.ridgeY - c.eavesY) * (1 - (z / c.halfD) ** 2)
}

function zNodesOf(c: Cfg): number[] {
  return Array.from(
    { length: c.archN + 1 },
    (_, i) => -c.halfD + (2 * c.halfD * i) / c.archN,
  )
}

function trussXsOf(c: Cfg): number[] {
  const xs: number[] = []
  const max = c.halfX - 4
  for (let x = -max; x <= max + 1e-6; x += c.trussStep) xs.push(x)
  return xs
}

/** Axis-aligned member centered at (x,y,z). */
function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): BoxGeometry {
  const g = new BoxGeometry(sx, sy, sz)
  g.translate(x, y, z)
  return g
}

/** Square-section beam running between two points (chords, webs, diagonals). */
function beam(a: P, b: P, t: number): BoxGeometry {
  const va = new Vector3(...a)
  const vb = new Vector3(...b)
  const dir = new Vector3().subVectors(vb, va)
  const len = dir.length()
  const g = new BoxGeometry(t, len, t)
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize())
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3().addVectors(va, vb).multiplyScalar(0.5),
      q,
      ONE,
    ),
  )
  return g
}

function buildSteel(c: Cfg): BufferGeometry {
  const parts: BoxGeometry[] = []
  const zNodes = zNodesOf(c)
  // Primary curved lattice trusses across the width, repeated along the hall.
  for (const x of trussXsOf(c)) {
    const top: P[] = zNodes.map((z) => [x, archYAt(z, c), z])
    const bot: P[] = zNodes.map((z) => [x, archYAt(z, c) - 1.0, z])
    for (let i = 0; i < c.archN; i++) {
      parts.push(beam(top[i], top[i + 1], 0.14)) // top chord
      parts.push(beam(bot[i], bot[i + 1], 0.11)) // bottom chord
    }
    for (let i = 0; i <= c.archN; i++) {
      parts.push(beam(top[i], bot[i], 0.08)) // vertical web
      if (i < c.archN) parts.push(beam(bot[i], top[i + 1], 0.06)) // diagonal web
    }
  }
  // Longitudinal purlins tying the trusses (and the eave beams at z = +/-halfD).
  for (let i = 0; i <= c.archN; i++) {
    const z = zNodes[i]
    parts.push(box(0, archYAt(z, c) + 0.02, z, 2 * c.halfX, 0.09, 0.09))
  }
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

/** Width of a big sectional dock door punched into a long wall. */
function dockDoorW(c: Cfg): number {
  return Math.min(2 * c.halfX * 0.24, 14)
}

/** Half-width (in z) of the ground-level rail gate punched into a gable so the
 *  spine rail can run straight through the shop. */
const GATE_HALF_Z = 4
/** Height of the rail-gate opening / header. */
function gateHeight(c: Cfg): number {
  return c.eavesY * 0.66
}

function buildWalls(c: Cfg): BufferGeometry {
  const parts: BoxGeometry[] = []
  const zNodes = zNodesOf(c)
  const clerY = c.eavesY * 0.82
  // Long side walls up to the eaves. When a long wall carries a dock door we
  // leave a central opening (two side segments + a lintel above) so vehicles /
  // the inbound rail can pass straight through it.
  const dw = dockDoorW(c)
  const doorH = c.eavesY * 0.74
  for (const [sz, hasDoor] of [
    [c.halfD, !!c.doors.north],
    [-c.halfD, !!c.doors.south],
  ] as [number, boolean][]) {
    if (hasDoor) {
      const seg = c.halfX - dw / 2
      parts.push(box(-(dw / 2 + seg / 2), c.eavesY / 2, sz, seg, c.eavesY, 0.3))
      parts.push(box(dw / 2 + seg / 2, c.eavesY / 2, sz, seg, c.eavesY, 0.3))
      parts.push(box(0, (doorH + c.eavesY) / 2, sz, dw, c.eavesY - doorH, 0.3))
    } else {
      parts.push(box(0, c.eavesY / 2, sz, 2 * c.halfX, c.eavesY, 0.3))
    }
  }
  // Arched gable ends (stepped strips following the roof curve). Where a gable
  // carries the spine rail we leave a central ground-level gate opening (the
  // strip over the gate starts above the header instead of the floor).
  const gateH = gateHeight(c)
  for (const gx of [c.halfX, -c.halfX]) {
    const hasGate = gx > 0 ? !!c.doors.east : !!c.doors.west
    for (let i = 0; i < c.archN; i++) {
      const cz = (zNodes[i] + zNodes[i + 1]) / 2
      const h = archYAt(cz, c)
      const depth = zNodes[i + 1] - zNodes[i] + 0.05
      if (hasGate && Math.abs(cz) < GATE_HALF_Z) {
        parts.push(box(gx, (gateH + h) / 2, cz, 0.3, h - gateH, depth))
      } else {
        parts.push(box(gx, h / 2, cz, 0.3, h, depth))
      }
    }
  }
  // Clerestory mullions on both long walls.
  const mullMax = c.halfX - 5
  for (const sz of [c.halfD - 0.18, -(c.halfD - 0.18)]) {
    for (let x = -mullMax; x <= mullMax; x += 3.5)
      parts.push(box(x, clerY, sz, 0.12, 1.4, 0.12))
  }
  // Two office window ribbons + mullions on the chosen long wall.
  if (c.doors.office) {
    const wallZ = (c.doors.office === 'north' ? 1 : -1) * (c.halfD - 0.18)
    const offMax = c.halfX * 0.58
    for (let x = -offMax; x <= offMax; x += 3) {
      parts.push(box(x, c.eavesY * 0.34, wallZ, 0.12, 1.5, 0.12))
      parts.push(box(x, c.eavesY * 0.59, wallZ, 0.12, 1.5, 0.12))
    }
  }
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

function buildGlass(c: Cfg): BufferGeometry {
  const parts: BoxGeometry[] = []
  const zi = c.halfD - 0.16
  const clerY = c.eavesY * 0.82
  const clerW = 2 * c.halfX - 10
  // Clerestory ribbons, both long walls.
  parts.push(box(0, clerY, zi, clerW, 1.3, 0.06))
  parts.push(box(0, clerY, -zi, clerW, 1.3, 0.06))
  // Office ribbons on the chosen wall.
  if (c.doors.office) {
    const wallZ = (c.doors.office === 'north' ? 1 : -1) * zi
    const offW = c.halfX * 1.2
    parts.push(box(0, c.eavesY * 0.34, wallZ, offW, 1.4, 0.06))
    parts.push(box(0, c.eavesY * 0.59, wallZ, offW, 1.4, 0.06))
  }
  // (Gable gates are open for the spine rail — no glazed sectional door here.)
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

function buildSlate(c: Cfg): BufferGeometry {
  const parts: BoxGeometry[] = []
  // Personnel doors along the side walls.
  for (const f of [-0.78, -0.4, 0.4, 0.78]) {
    const x = f * c.halfX
    parts.push(box(x, 1.1, c.halfD - 0.2, 1.2, 2.2, 0.1))
    parts.push(box(x, 1.1, -(c.halfD - 0.2), 1.2, 2.2, 0.1))
  }
  // Gable rail gates: a rolled-up header drum + jamb posts framing the opening
  // the spine rail runs through (kept clear — no closed panel).
  const gateH = gateHeight(c)
  for (const [gx, has] of [
    [c.halfX, !!c.doors.east],
    [-c.halfX, !!c.doors.west],
  ] as [number, boolean][]) {
    if (!has) continue
    const sgn = gx > 0 ? 1 : -1
    parts.push(box(gx - sgn * 0.2, gateH - 0.1, 0, 0.4, 0.55, 2 * GATE_HALF_Z + 0.8))
    for (const sz of [GATE_HALF_Z + 0.2, -(GATE_HALF_Z + 0.2)])
      parts.push(box(gx - sgn * 0.15, gateH / 2, sz, 0.4, gateH, 0.4))
  }
  // Long-wall dock doors: drawn rolled UP (just the header drum) so the opening
  // stays clear for the inbound rail / dispatch traffic passing through.
  const dw = dockDoorW(c)
  const headY = c.eavesY * 0.74 - 0.35
  if (c.doors.north)
    parts.push(box(0, headY, c.halfD - 0.22, dw, 0.7, 0.34))
  if (c.doors.south)
    parts.push(box(0, headY, -(c.halfD - 0.22), dw, 0.7, 0.34))
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

interface ShellGeo {
  steel: BufferGeometry
  wall: BufferGeometry
  glass: BufferGeometry
  slate: BufferGeometry
  skylights: { y: number; z: number; w: number }[]
}

// Cache merged geometry per unique footprint so repeated shop sizes are built once.
const GEO_CACHE = new Map<string, ShellGeo>()

function shellGeo(c: Cfg): ShellGeo {
  const key = `${c.halfX}|${c.halfD}|${c.eavesY}|${c.ridgeY}|${c.archN}|${c.trussStep}|${c.doors.office}|${!!c.doors.east}|${!!c.doors.west}|${!!c.doors.north}|${!!c.doors.south}`
  const cached = GEO_CACHE.get(key)
  if (cached) return cached
  const skylights = [-0.76, -0.38, 0, 0.38, 0.76].map((f) => {
    const z = f * c.halfD
    return { y: archYAt(z, c) + 0.18, z, w: 2 * c.halfX - 8 }
  })
  const geo: ShellGeo = {
    steel: buildSteel(c),
    wall: buildWalls(c),
    glass: buildGlass(c),
    slate: buildSlate(c),
    skylights,
  }
  GEO_CACHE.set(key, geo)
  return geo
}

const noRaycast = () => null

export function FactoryShell(props: FactoryShellProps = {}) {
  const cfg: Cfg = {
    halfX: props.halfX ?? DEFAULTS.halfX,
    halfD: props.halfD ?? DEFAULTS.halfD,
    eavesY: props.eavesY ?? DEFAULTS.eavesY,
    ridgeY: props.ridgeY ?? DEFAULTS.ridgeY,
    archN: props.archN ?? DEFAULTS.archN,
    trussStep: props.trussStep ?? DEFAULTS.trussStep,
    doors: props.doors ?? DEFAULTS.doors,
  }
  const wallColor = props.wallColor ?? '#eceef0'
  const steelColor = props.steelColor ?? '#b4bcc4'

  const geo = useMemo(
    () => shellGeo(cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cfg.halfX,
      cfg.halfD,
      cfg.eavesY,
      cfg.ridgeY,
      cfg.archN,
      cfg.trussStep,
      cfg.doors.office,
      cfg.doors.east,
      cfg.doors.west,
      cfg.doors.north,
      cfg.doors.south,
    ],
  )

  return (
    <group>
      <mesh geometry={geo.steel} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={steelColor} metalness={0.55} roughness={0.5} />
      </mesh>
      <mesh geometry={geo.wall} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>
      <mesh geometry={geo.glass} raycast={noRaycast}>
        <meshStandardMaterial
          color="#cdd8e2"
          metalness={0.2}
          roughness={0.12}
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh geometry={geo.slate} castShadow raycast={noRaycast}>
        <meshStandardMaterial color="#5b6470" metalness={0.35} roughness={0.55} />
      </mesh>
      {/* Translucent skylight bands following the vault */}
      {geo.skylights.map((s) => (
        <mesh key={s.z} position={[0, s.y, s.z]} raycast={noRaycast}>
          <boxGeometry args={[s.w, 0.06, 1.9]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#eaf3ff"
            emissiveIntensity={0.85}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}
    </group>
  )
}
