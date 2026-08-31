import type { ShellDoors } from './FactoryShell'

/**
 * Campus layout: the automotive plant as a set of connected shop buildings laid
 * out along an X spine (Stamping -> Body -> Paint -> Powertrain) with the
 * Warehouse feeding the body shop from the +Z side.
 *
 * This mirrors the building `meta` seeded in the backend (backend/app/seed.py).
 * The backend twin is the source of truth at runtime — `Campus` prefers a
 * building node's `meta` when present and falls back to these defaults (keyed by
 * node id) so the scene still renders if the DB predates the campus seed.
 */

export type ShopType =
  | 'stamping'
  | 'body'
  | 'paint'
  | 'powertrain'
  | 'warehouse'
  | 'assembly'
  | 'finalcheck'

export interface BuildingDef {
  /** Matching HierarchyNode id (level = "building"). */
  id: string
  name: string
  shopType: ShopType
  /** World position of the building centre. */
  x: number
  z: number
  rotationY: number
  halfX: number
  halfD: number
  eavesY: number
  ridgeY: number
  doors: ShellDoors
}

export const CAMPUS: BuildingDef[] = [
  {
    id: 'nd-hall-stamp',
    name: 'Stamping Shop',
    shopType: 'stamping',
    x: -150,
    z: 0,
    rotationY: 0,
    halfX: 42,
    halfD: 26,
    // Press shop runs tall: coil cranes and die changes need the headroom.
    eavesY: 14,
    ridgeY: 16.5,
    doors: { east: true, west: true, office: 'south' },
  },
  {
    id: 'nd-hall-a',
    name: 'Body / Weld Shop',
    shopType: 'body',
    x: 0,
    z: 0,
    rotationY: 0,
    halfX: 49,
    halfD: 29,
    eavesY: 9,
    ridgeY: 13.5,
    doors: { east: true, west: true, office: 'south' },
  },
  {
    id: 'nd-hall-paint',
    name: 'Paint Shop',
    shopType: 'paint',
    x: 150,
    z: 0,
    rotationY: 0,
    halfX: 44,
    halfD: 27,
    eavesY: 9,
    ridgeY: 13,
    doors: { east: true, west: true, office: 'south' },
  },
  {
    id: 'nd-hall-power',
    name: 'Powertrain / Machining',
    shopType: 'powertrain',
    x: 285,
    z: 0,
    rotationY: 0,
    halfX: 42,
    halfD: 26,
    eavesY: 8.5,
    ridgeY: 12.5,
    doors: { east: true, west: true, office: 'south' },
  },
  {
    id: 'nd-hall-wh',
    name: 'Warehouse / Logistics',
    shopType: 'warehouse',
    x: 0,
    z: 105,
    rotationY: 0,
    halfX: 60,
    halfD: 32,
    eavesY: 11,
    ridgeY: 15,
    doors: { north: true, south: true, office: null },
  },
  {
    id: 'nd-hall-ga',
    name: 'General / Final Assembly',
    shopType: 'assembly',
    x: 420,
    z: 0,
    rotationY: 0,
    halfX: 46,
    halfD: 28,
    eavesY: 9,
    ridgeY: 13.5,
    doors: { east: true, west: true, office: 'south' },
  },
  {
    id: 'nd-hall-check',
    name: 'Final Check / Inspection',
    shopType: 'finalcheck',
    x: 555,
    z: 0,
    rotationY: 0,
    halfX: 44,
    halfD: 24,
    eavesY: 8,
    ridgeY: 11.5,
    doors: { east: true, west: true, office: 'south' },
  },
]

export const CAMPUS_BY_ID: Record<string, BuildingDef> = Object.fromEntries(
  CAMPUS.map((b) => [b.id, b]),
)

/**
 * Where to point the orbit camera to frame a building (or the whole campus when
 * id is null). Returns the look-at centre and a good viewing distance for a
 * ~45° FOV camera.
 */
export function focusFrame(id: string | null): {
  cx: number
  cz: number
  dist: number
} {
  const TAN_HALF_FOV = Math.tan((45 * Math.PI) / 180 / 2) // ~0.414
  if (id) {
    const b = CAMPUS_BY_ID[id]
    if (b) {
      const maxHalf = Math.max(b.halfX, b.halfD, b.ridgeY)
      return { cx: b.x, cz: b.z, dist: (maxHalf / TAN_HALF_FOV) * 1.15 }
    }
  }
  const e = campusExtent(30)
  const maxHalf = Math.max(e.w, e.d) / 2
  return { cx: e.cx, cz: e.cz, dist: (maxHalf / TAN_HALF_FOV) * 0.85 }
}

/** Axis-aligned world extents of the whole campus (with padding for the yard). */
export function campusExtent(pad = 40) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const b of CAMPUS) {
    minX = Math.min(minX, b.x - b.halfX)
    maxX = Math.max(maxX, b.x + b.halfX)
    minZ = Math.min(minZ, b.z - b.halfD)
    maxZ = Math.max(maxZ, b.z + b.halfD)
  }
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: maxX - minX + pad * 2,
    d: maxZ - minZ + pad * 2,
  }
}
