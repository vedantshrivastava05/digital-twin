import { useMemo } from 'react'
import { BoxGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ShellDoors } from './FactoryShell'

/**
 * Precast-concrete mill building, modelled on the stamping-shop reference: bare
 * concrete panel walls on expressed piers, full-height steel industrial windows
 * between them, a clerestory ribbon under a flat parapet, a row of sawtooth roof
 * monitors, a blank stair/service tower breaking the elevation, and two banded
 * stacks at the east end.
 *
 * Like `FactoryShell` everything is thin boxes merged per material, so the whole
 * building is a handful of draw calls, and the roof deck plus monitor glazing
 * stay translucent so the presses are still visible from the orbit camera.
 */

export interface MillShellProps {
  halfX?: number
  halfD?: number
  eavesY?: number
  doors?: ShellDoors
}

interface Cfg {
  halfX: number
  halfD: number
  eavesY: number
  doors: ShellDoors
}

/** Half-width of the ground-level rail gate — matches FactoryShell so the spine
 *  rail lines up through every shop. */
const GATE_HALF_Z = 4
const WALL_T = 0.38
const PIER_T = 0.62
const PIER_W = 1.15

interface Bands {
  base: number
  winTop: number
  bandTop: number
  clerTop: number
  parapet: number
}

function bandsOf(c: Cfg): Bands {
  return {
    base: 1.15,
    winTop: c.eavesY * 0.6,
    bandTop: c.eavesY * 0.72,
    clerTop: c.eavesY * 0.91,
    parapet: c.eavesY + 1.2,
  }
}

/** Rail gate height. Capped so a tall press shop still gets a door-sized
 *  opening rather than a hole most of the way up the gable. */
function gateHeight(c: Cfg): number {
  return Math.min(c.eavesY * 0.66, 7)
}

function dockDoorW(c: Cfg): number {
  return Math.min(2 * c.halfX * 0.24, 14)
}

/** Pier positions along a wall of half-length `half`, ~6.5 m apart. */
function piersOf(half: number) {
  const n = Math.max(4, Math.round((2 * half) / 6.5))
  const pitch = (2 * half) / n
  return {
    n,
    pitch,
    us: Array.from({ length: n + 1 }, (_, i) => -half + i * pitch),
  }
}

function box(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const g = new BoxGeometry(sx, sy, sz)
  g.translate(x, y, z)
  return g
}

interface Sink {
  concrete: BoxGeometry[]
  panel: BoxGeometry[]
  steel: BoxGeometry[]
  glass: BoxGeometry[]
  dark: BoxGeometry[]
}

interface WallOpts {
  /** Which axis the wall faces: 'z' = long wall at z=±half2, 'x' = gable. */
  normal: 'x' | 'z'
  sign: 1 | -1
  /** Half-length of the wall along its own run. */
  half: number
  /** Distance of the wall plane from the origin. */
  half2: number
  /** Central opening (rail gate or dock door) punched at u = 0. */
  openHalf: number
  openH: number
}

/**
 * One elevation: plinth, expressed piers, glazed bays with their steel grid, the
 * spandrel band, clerestory ribbon and parapet — with the central bays left open
 * where a gate or dock door punches through.
 */
function buildWall(s: Sink, c: Cfg, o: WallOpts) {
  const b = bandsOf(c)
  // Map a wall-local (u, y, run-length, height, thickness) onto world axes.
  const put = (u: number, y: number, lu: number, ly: number, th: number) =>
    o.normal === 'z'
      ? box(u, y, o.sign * o.half2, lu, ly, th)
      : box(o.sign * o.half2, y, u, th, ly, lu)

  // Pier grid. Where an opening punches through, the grid is re-cut so a pair of
  // jamb piers frames it exactly — otherwise a column lands mid-doorway.
  let us = piersOf(o.half).us
  if (o.openHalf > 0) {
    const jamb = o.openHalf + PIER_W / 2
    us = [...us.filter((u) => Math.abs(u) > jamb + PIER_W * 0.6), jamb, -jamb].sort(
      (a, b2) => a - b2,
    )
  }

  // Expressed piers, full height including the parapet.
  for (const u of us) s.concrete.push(put(u, b.parapet / 2, PIER_W, b.parapet, PIER_T))

  for (let i = 0; i < us.length - 1; i++) {
    const u0 = us[i] + PIER_W / 2
    const u1 = us[i + 1] - PIER_W / 2
    const mid = (u0 + u1) / 2
    const w = u1 - u0
    const blocked = o.openHalf > 0 && Math.abs(mid) < 0.5
    if (blocked) {
      // Bay is the opening: infill runs from the header up to the clerestory.
      s.panel.push(
        put(mid, (o.openH + b.bandTop) / 2, w, b.bandTop - o.openH, WALL_T),
      )
      continue
    }
    // Solid plinth under the glazing.
    s.concrete.push(put(mid, b.base / 2, w, b.base, WALL_T))
    // The tall industrial window and its steel grid.
    const winH = b.winTop - b.base
    s.glass.push(put(mid, (b.base + b.winTop) / 2, w - 0.15, winH - 0.1, 0.1))
    const mulls = Math.max(2, Math.round(w / 1.35))
    for (let m = 1; m < mulls; m++)
      s.steel.push(put(u0 + (m * w) / mulls, (b.base + b.winTop) / 2, 0.11, winH, 0.16))
    const rows = Math.max(2, Math.round(winH / 1.5))
    for (let r = 0; r <= rows; r++)
      s.steel.push(put(mid, b.base + (r * winH) / rows, w, 0.12, 0.17))
    // Spandrel panel over the window head.
    s.panel.push(
      put(mid, (b.winTop + b.bandTop) / 2, w, b.bandTop - b.winTop, WALL_T),
    )
  }

  // Clerestory ribbon and its mullions, continuous over the whole elevation.
  const clerH = b.clerTop - b.bandTop
  s.glass.push(put(0, (b.bandTop + b.clerTop) / 2, 2 * o.half - PIER_W, clerH - 0.12, 0.1))
  for (let u = -o.half + 1.8; u <= o.half - 1.8; u += 2.1)
    s.steel.push(put(u, (b.bandTop + b.clerTop) / 2, 0.1, clerH, 0.16))
  // Parapet capping the elevation.
  s.panel.push(put(0, (b.clerTop + b.parapet) / 2, 2 * o.half, b.parapet - b.clerTop, WALL_T))
  s.concrete.push(put(0, b.parapet, 2 * o.half + 0.3, 0.22, PIER_T + 0.1))

  // Header drum over the opening.
  if (o.openHalf > 0) {
    s.dark.push(put(0, o.openH - 0.15, 2 * o.openHalf + 0.9, 0.55, WALL_T + 0.2))
    for (const su of [o.openHalf + 0.25, -(o.openHalf + 0.25)])
      s.dark.push(put(su, o.openH / 2, 0.45, o.openH, WALL_T + 0.15))
  }
}

/** Flat roof deck, sawtooth monitors and the roof structure below them. */
function buildRoof(s: Sink, c: Cfg, deck: BoxGeometry[]) {
  const b = bandsOf(c)
  deck.push(box(0, c.eavesY, 0, 2 * c.halfX - 0.6, 0.22, 2 * c.halfD - 0.6))

  // North-light monitors marching down the roof: a glazed riser with a sloping
  // cap behind it, the sawtooth silhouette of the reference.
  const runZ = 2 * c.halfD - 6
  const pitch = 5.6
  const rise = 1.75
  const slope = 3.5
  const angle = Math.atan2(rise, slope)
  for (let x = -c.halfX + 5; x <= c.halfX - 7; x += pitch) {
    s.glass.push(box(x, c.eavesY + rise / 2 + 0.1, 0, 0.12, rise, runZ - 0.4))
    s.steel.push(box(x, c.eavesY + rise + 0.12, 0, 0.28, 0.24, runZ))
    s.steel.push(box(x, c.eavesY + rise / 2, 0, 0.2, rise, 0.2))
    for (const sz of [runZ / 2, -runZ / 2])
      s.steel.push(box(x, c.eavesY + rise / 2, sz, 0.22, rise, 0.22))
    // Sloping back panel down to the deck.
    const cap = new BoxGeometry(Math.hypot(slope, rise), 0.16, runZ)
    cap.rotateZ(-angle)
    cap.translate(x + slope / 2, c.eavesY + rise / 2 + 0.2, 0)
    s.dark.push(cap)
  }

  // Roof structure: a beam on every pier line with purlins tying them.
  const { us } = piersOf(c.halfX)
  for (const x of us)
    s.steel.push(box(x, c.eavesY - 0.5, 0, 0.32, 0.55, 2 * c.halfD - 1.2))
  for (let z = -c.halfD + 4; z <= c.halfD - 4; z += 6)
    s.steel.push(box(0, c.eavesY - 0.95, z, 2 * c.halfX - 1.2, 0.22, 0.22))
  // Interior pilasters carrying the beams, tight to the walls so the floor stays
  // clear for the press line.
  for (const x of us)
    for (const sz of [c.halfD - 0.9, -(c.halfD - 0.9)])
      s.concrete.push(box(x, b.parapet * 0.42, sz, 0.7, b.parapet * 0.84, 0.7))
}

/** Blank stair / service tower breaking the south elevation. */
function buildTower(s: Sink, c: Cfg) {
  const b = bandsOf(c)
  const x = -c.halfX * 0.16
  const z = -(c.halfD + 1.1)
  const h = b.parapet + 3.4
  const w = 11.5
  s.concrete.push(box(x, h / 2, z, w, h, 3.2))
  s.concrete.push(box(x, h + 0.16, z, w + 0.5, 0.32, 3.7))
  // Recessed panel joints so the blank mass still reads as precast.
  for (const dx of [-w / 4, 0, w / 4])
    s.panel.push(box(x + dx, h / 2, z - 1.62, 0.14, h - 1.2, 0.1))
  // Service door at its base.
  s.dark.push(box(x + w / 2 - 2.2, 1.3, z - 1.66, 2.0, 2.6, 0.12))
}

interface MillGeo {
  concrete: BufferGeometry
  panel: BufferGeometry
  steel: BufferGeometry
  glass: BufferGeometry
  dark: BufferGeometry
  deck: BufferGeometry
  stacks: { x: number; z: number }[]
}

const GEO_CACHE = new Map<string, MillGeo>()

function millGeo(c: Cfg): MillGeo {
  const key = `${c.halfX}|${c.halfD}|${c.eavesY}|${!!c.doors.east}|${!!c.doors.west}|${!!c.doors.north}|${!!c.doors.south}`
  const cached = GEO_CACHE.get(key)
  if (cached) return cached

  const s: Sink = { concrete: [], panel: [], steel: [], glass: [], dark: [] }
  const deck: BoxGeometry[] = []
  const gateH = gateHeight(c)
  const dockW = dockDoorW(c)
  const dockH = c.eavesY * 0.74

  buildWall(s, c, {
    normal: 'z',
    sign: 1,
    half: c.halfX,
    half2: c.halfD,
    openHalf: c.doors.north ? dockW / 2 : 0,
    openH: dockH,
  })
  buildWall(s, c, {
    normal: 'z',
    sign: -1,
    half: c.halfX,
    half2: c.halfD,
    openHalf: c.doors.south ? dockW / 2 : 0,
    openH: dockH,
  })
  buildWall(s, c, {
    normal: 'x',
    sign: 1,
    half: c.halfD,
    half2: c.halfX,
    openHalf: c.doors.east ? GATE_HALF_Z : 0,
    openH: gateH,
  })
  buildWall(s, c, {
    normal: 'x',
    sign: -1,
    half: c.halfD,
    half2: c.halfX,
    openHalf: c.doors.west ? GATE_HALF_Z : 0,
    openH: gateH,
  })
  buildRoof(s, c, deck)
  buildTower(s, c)

  const weld = (parts: BoxGeometry[]) => {
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    return merged
  }
  const geo: MillGeo = {
    concrete: weld(s.concrete),
    panel: weld(s.panel),
    steel: weld(s.steel),
    glass: weld(s.glass),
    dark: weld(s.dark),
    deck: weld(deck),
    stacks: [
      { x: c.halfX * 0.52, z: -c.halfD * 0.42 },
      { x: c.halfX * 0.78, z: -c.halfD * 0.42 },
    ],
  }
  GEO_CACHE.set(key, geo)
  return geo
}

/** Banded steel stack rising off the roof. */
function Stack({ x, z, baseY }: { x: number; z: number; baseY: number }) {
  const H = 13.5
  const R = 0.78
  return (
    <group position={[x, baseY, z]}>
      {/* Concrete kerb the stack sits on */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[2.4, 0.7, 2.4]} />
        <meshStandardMaterial color="#b9bab7" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.7 + H / 2, 0]} castShadow>
        <cylinderGeometry args={[R, R * 1.06, H, 18]} />
        <meshStandardMaterial color="#dfe3e6" metalness={0.3} roughness={0.55} />
      </mesh>
      {/* Painted bands */}
      {[0.28, 0.62, 0.9].map((f) => (
        <mesh key={f} position={[0, 0.7 + H * f, 0]}>
          <cylinderGeometry args={[R * 1.03, R * 1.03, H * 0.13, 18]} />
          <meshStandardMaterial color="#1d4e79" metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      {/* Cap ring and a couple of stay brackets */}
      <mesh position={[0, 0.7 + H, 0]}>
        <cylinderGeometry args={[R * 1.16, R * 1.16, 0.28, 18]} />
        <meshStandardMaterial color="#4a5260" metalness={0.5} roughness={0.45} />
      </mesh>
      {[0.42, 0.76].map((f) => (
        <mesh key={f} position={[0, 0.7 + H * f, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[R * 1.1, 0.05, 6, 16]} />
          <meshStandardMaterial color="#8a929e" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

const noRaycast = () => null

export function MillShell(props: MillShellProps = {}) {
  const cfg: Cfg = {
    halfX: props.halfX ?? 42,
    halfD: props.halfD ?? 26,
    eavesY: props.eavesY ?? 8.5,
    doors: props.doors ?? { east: true, west: true },
  }

  const geo = useMemo(
    () => millGeo(cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cfg.halfX,
      cfg.halfD,
      cfg.eavesY,
      cfg.doors.east,
      cfg.doors.west,
      cfg.doors.north,
      cfg.doors.south,
    ],
  )

  return (
    <group>
      <mesh geometry={geo.concrete} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color="#c4c6c3" roughness={0.95} />
      </mesh>
      <mesh geometry={geo.panel} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color="#b3b6b3" roughness={0.96} />
      </mesh>
      <mesh geometry={geo.steel} castShadow raycast={noRaycast}>
        <meshStandardMaterial color="#39404a" metalness={0.5} roughness={0.55} />
      </mesh>
      <mesh geometry={geo.glass} raycast={noRaycast}>
        <meshStandardMaterial
          color="#9fb0bd"
          metalness={0.25}
          roughness={0.15}
          transparent
          opacity={0.42}
        />
      </mesh>
      <mesh geometry={geo.dark} castShadow raycast={noRaycast}>
        <meshStandardMaterial color="#59616c" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Roof deck stays translucent so the press line reads from above */}
      <mesh geometry={geo.deck} raycast={noRaycast}>
        <meshStandardMaterial
          color="#b6b9b6"
          roughness={0.95}
          transparent
          opacity={0.34}
        />
      </mesh>
      {geo.stacks.map((s) => (
        <Stack key={s.x} x={s.x} z={s.z} baseY={cfg.eavesY} />
      ))}
    </group>
  )
}
