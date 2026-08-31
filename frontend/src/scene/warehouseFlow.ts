/**
 * Warehouse logistics "director": the single source of truth for the storage
 * material flow the forklifts and box decor share.
 *
 *   outside truck --rail--> RECEIVING PILE --FL1--> SHELF STAGING
 *        --FL2/FL3--> AS/RS RACKS --FL4 (steady)--> DISPATCH (to manufacturing)
 *
 * The flow is a continuous, fixed-look loop (per the product choice), so nothing
 * here tracks live inventory. Instead it exposes:
 *   - the world-space BUFFER points every actor references, and
 *   - a per-role world-space keyframe ROUTE for the forklifts,
 * plus a small keyframe evaluator. Each forklift advances its OWN clock (gated by
 * its status) with a fixed phase offset, so the four trucks stay staggered and
 * hand boxes across the shared buffers without a runtime scheduler.
 *
 * Coordinates are world-space and mirror the warehouse seed (centre 0,105; AS/RS
 * racks at x=-38/0/38, z=100; north dock door + rail at x=0).
 */

export interface Vec2 {
  x: number
  z: number
}

/** Shared buffer points (world). */
export const WH = {
  /** Where the inbound rail deposits — the receiving pile. */
  PILE: { x: 0, z: 117 } as Vec2,
  /** Shelf-side staging (FL1 drops here; FL2/FL3 pick from here). */
  STAGE: { x: 0, z: 110 } as Vec2,
  /** North (put-away) face of the left / right racks. */
  RACK_L: { x: -38, z: 105 } as Vec2,
  RACK_R: { x: 38, z: 105 } as Vec2,
  /** South (retrieval) face of the centre rack. */
  RACK_S: { x: 0, z: 95 } as Vec2,
  /** Dispatch drop feeding the body shop (near the south dock door). */
  MFG: { x: 0, z: 82 } as Vec2,
  /** Rail entry point (just inside the north door). */
  RAIL_IN: { x: 0, z: 136 } as Vec2,
}

export type ForkRole = 'receiving' | 'putawayL' | 'putawayR' | 'retrieval'

/** Forklift instances (sorted by id) map to these roles by index. */
export const ROLE_BY_INDEX: ForkRole[] = [
  'receiving',
  'putawayL',
  'putawayR',
  'retrieval',
]

export interface WorldKey {
  /** World position. */
  x: number
  z: number
  /** Body heading (rad); local +X = forks-forward. */
  yaw: number
  /** Fork carriage height 0..~1. */
  lift: number
  /** Seconds to travel INTO this key from the previous one. */
  move: number
  /** Seconds to dwell at this key (working). */
  hold: number
  /** Whether a pallet is on the forks at / into this key. */
  loaded: boolean
}

/** Yaw so a forklift's local +X (forks) points from `a` toward `b`. */
function yawTo(a: Vec2, b: Vec2): number {
  return Math.atan2(-(b.z - a.z), b.x - a.x)
}

/** Slight lateral nudge so the two put-away trucks don't share the exact drop. */
function offset(p: Vec2, dx: number, dz = 0): Vec2 {
  return { x: p.x + dx, z: p.z + dz }
}

function receivingRoute(): WorldKey[] {
  const src = WH.PILE
  const dst = offset(WH.STAGE, 0, 0.5)
  const y = yawTo(src, dst)
  return [
    { ...src, yaw: y, lift: 0.06, move: 0.6, hold: 0.7, loaded: false }, // wait at pile
    { ...src, yaw: y, lift: 0.28, move: 0.6, hold: 0.4, loaded: true }, // fork under a crate
    { ...src, yaw: y, lift: 0.14, move: 0.35, hold: 0.1, loaded: true }, // lift to carry
    { ...dst, yaw: y, lift: 0.14, move: 1.3, hold: 0.4, loaded: true }, // carry to staging
    { ...dst, yaw: y, lift: 0.04, move: 0.5, hold: 0.5, loaded: false }, // set the crate down
    { ...src, yaw: y, lift: 0.04, move: 1.2, hold: 0.2, loaded: false }, // reverse back empty
  ]
}

function putawayRoute(rack: Vec2, pickDx: number): WorldKey[] {
  const src = offset(WH.STAGE, pickDx, 0.5)
  const y = yawTo(src, rack)
  return [
    { ...src, yaw: y, lift: 0.06, move: 0.6, hold: 0.6, loaded: false }, // wait at staging
    { ...src, yaw: y, lift: 0.26, move: 0.6, hold: 0.4, loaded: true }, // grab a crate
    { ...src, yaw: y, lift: 0.16, move: 0.3, hold: 0.1, loaded: true }, // lift to carry
    { ...rack, yaw: y, lift: 0.16, move: 1.7, hold: 0.3, loaded: true }, // drive to the rack
    { ...rack, yaw: y, lift: 1.0, move: 1.0, hold: 0.8, loaded: true }, // raise to a shelf
    { ...rack, yaw: y, lift: 0.9, move: 0.4, hold: 0.2, loaded: false }, // deposit on the shelf
    { ...rack, yaw: y, lift: 0.12, move: 0.6, hold: 0.1, loaded: false }, // lower empty forks
    { ...src, yaw: y, lift: 0.12, move: 1.6, hold: 0.2, loaded: false }, // reverse back empty
  ]
}

function retrievalRoute(): WorldKey[] {
  const rack = WH.RACK_S
  const dst = WH.MFG
  const yPick = yawTo(rack, { x: rack.x, z: rack.z + 5 }) // face the rack (north)
  const yGo = yawTo(rack, dst) // face the dispatch drop (south)
  return [
    { ...rack, yaw: yPick, lift: 0.1, move: 0.6, hold: 0.5, loaded: false }, // at rack, facing shelf
    { ...rack, yaw: yPick, lift: 1.0, move: 0.9, hold: 0.8, loaded: true }, // raise + pick a tote
    { ...rack, yaw: yPick, lift: 0.16, move: 0.6, hold: 0.2, loaded: true }, // lower to carry
    { ...rack, yaw: yGo, lift: 0.16, move: 0.8, hold: 0.2, loaded: true }, // pivot toward dispatch
    { ...dst, yaw: yGo, lift: 0.16, move: 1.5, hold: 0.3, loaded: true }, // drive to dispatch
    { ...dst, yaw: yGo, lift: 0.04, move: 0.5, hold: 0.5, loaded: false }, // drop for manufacturing
    { ...rack, yaw: yGo, lift: 0.06, move: 1.5, hold: 0.1, loaded: false }, // reverse back to rack
    { ...rack, yaw: yPick, lift: 0.06, move: 0.7, hold: 0.2, loaded: false }, // pivot to face shelf
  ]
}

export function routeFor(role: ForkRole): WorldKey[] {
  switch (role) {
    case 'receiving':
      return receivingRoute()
    case 'putawayL':
      return putawayRoute(WH.RACK_L, -4)
    case 'putawayR':
      return putawayRoute(WH.RACK_R, 4)
    case 'retrieval':
      return retrievalRoute()
  }
}

export interface Pose {
  x: number
  z: number
  yaw: number
  lift: number
  loaded: boolean
}

interface Seg {
  from: WorldKey
  to: WorldKey
  holdStart: number
  moveStart: number
  moveEnd: number
}

export interface CompiledRoute {
  segs: Seg[]
  total: number
}

/**
 * Realistic forklift travel speed (world units / second) while running. Travel
 * legs are timed by DISTANCE / this speed so a truck crossing the hall to a far
 * rack takes proportionally longer instead of teleporting.
 */
export const FORK_SPEED = 3.2

/**
 * Compile a route into a timeline: dwell at each key, then move to the next.
 * Travelling legs (distance > 0.5) are timed from distance/FORK_SPEED so speed
 * stays constant and believable; in-place legs (pivots, fork raises) keep their
 * authored `move` time.
 */
export function compileRoute(keys: WorldKey[], speed = FORK_SPEED): CompiledRoute {
  const n = keys.length
  let acc = 0
  const segs: Seg[] = keys.map((k, j) => {
    const to = keys[(j + 1) % n]
    const dist = Math.hypot(to.x - k.x, to.z - k.z)
    const move = dist > 0.5 ? dist / speed : to.move
    const holdStart = acc
    acc += k.hold
    const moveStart = acc
    acc += move
    return { from: k, to, holdStart, moveStart, moveEnd: acc }
  })
  return { segs, total: acc }
}

function smoothstep(x: number): number {
  return x * x * (3 - 2 * x)
}

/** Shortest-path angular interpolation. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Evaluate the world pose at time t (seconds) along a compiled route. */
export function evalRoute(route: CompiledRoute, t: number): Pose {
  let tt = t % route.total
  if (tt < 0) tt += route.total
  for (const s of route.segs) {
    if (tt < s.moveEnd) {
      if (tt < s.moveStart) {
        return {
          x: s.from.x,
          z: s.from.z,
          yaw: s.from.yaw,
          lift: s.from.lift,
          loaded: s.from.loaded,
        }
      }
      const u = smoothstep(
        (tt - s.moveStart) / Math.max(0.0001, s.moveEnd - s.moveStart),
      )
      return {
        x: s.from.x + (s.to.x - s.from.x) * u,
        z: s.from.z + (s.to.z - s.from.z) * u,
        yaw: lerpAngle(s.from.yaw, s.to.yaw, u),
        lift: s.from.lift + (s.to.lift - s.from.lift) * u,
        loaded: s.from.loaded,
      }
    }
  }
  const k = route.segs[0].from
  return { x: k.x, z: k.z, yaw: k.yaw, lift: k.lift, loaded: k.loaded }
}
