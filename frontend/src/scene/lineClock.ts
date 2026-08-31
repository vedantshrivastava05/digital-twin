/**
 * Per-line animation clocks. Each indexing line (body line, trim line, a paint
 * carrier loop, ...) owns its own clock keyed by the line's instance id. The
 * line component advances its clock every frame (respecting its status), and
 * the machines that serve that line (weld robots, paint robots) read the SAME
 * clock so their motion stays in lockstep with the parts dwelling in front of
 * them.
 *
 * A separate global `plantFlow` clock drives carrier parts travelling between
 * shops (see MaterialFlow) so cross-shop logistics advance independently of any
 * single line.
 */

const clocks = new Map<string, { t: number }>()

/** Get (or lazily create) the shared clock for a given line instance id. */
export function getLineClock(lineId: string): { t: number } {
  let c = clocks.get(lineId)
  if (!c) {
    c = { t: 0 }
    clocks.set(lineId, c)
  }
  return c
}

/** Global clock for cross-shop material flow / AGVs. */
export const plantFlow = { t: 0 }

/**
 * Shared clock id for the stamping press line. No line-category instance is
 * seeded for stamping (unlike the body line), so the blanking line, presses and
 * transfer robots all key off this constant instead of resolving via `lineOf`.
 * The blanking line advances it; presses + transfer robots only read it.
 */
export const STAMP_LINE_ID = 'stamp-line-1'

/**
 * Shared clock id for the final (general) assembly carrier line. The assembly
 * line advances it; the marriage/decking station reads it so the engine rises
 * exactly while a body is parked over the pit.
 */
export const GA_LINE_ID = 'ga-line-1'

/**
 * Shared clock id for the body-framing / underbody build cell in the stamping
 * shop. The cell advances it; the three loader arms + join press + fixture all
 * read it so loading, pressing and indexing stay in one sequence.
 */
export const FRAME_LINE_ID = 'frame-cell-1'

/**
 * Final-check hall choreography. Every inspection station (roller test bed,
 * headlamp aim rig, underbody deck, light tunnel) runs its own local clock but
 * shares this cycle length and phase split, so a car spends the same time at
 * each and the hall reads as one queue of cars moving west to east.
 */
export const CHECK_CYCLE_SEC = 14

export interface CheckPhase {
  /** 0..1 through the station cycle. */
  f: number
  /** Car position along the station's X axis (negative = still driving in). */
  carX: number
  /** False during the gap between cars. */
  carVisible: boolean
  /** True while the station is working on a parked car. */
  testing: boolean
  /** 0..1 ramp of test intensity while testing, 0 otherwise. */
  intensity: number
}

const DRIVE_IN = 0.14
const DRIVE_OUT = 0.8
const GAP = 0.94

export function checkPhase(t: number, span = 7): CheckPhase {
  const f = (t / CHECK_CYCLE_SEC) % 1
  if (f < DRIVE_IN) {
    const p = f / DRIVE_IN
    return { f, carX: -span * (1 - smoothstep(p)), carVisible: true, testing: false, intensity: 0 }
  }
  if (f < DRIVE_OUT) {
    const p = (f - DRIVE_IN) / (DRIVE_OUT - DRIVE_IN)
    // Ease intensity up over the first third of the dwell, hold, then release.
    const ramp = p < 0.3 ? smoothstep(p / 0.3) : p > 0.85 ? 1 - smoothstep((p - 0.85) / 0.15) : 1
    return { f, carX: 0, carVisible: true, testing: true, intensity: ramp }
  }
  if (f < GAP) {
    const p = (f - DRIVE_OUT) / (GAP - DRIVE_OUT)
    return { f, carX: span * smoothstep(p), carVisible: true, testing: false, intensity: 0 }
  }
  return { f, carX: span, carVisible: false, testing: false, intensity: 0 }
}

export const CYCLE_SEC = 7
/** First portion of each cycle is the index move, the rest is the weld dwell */
const MOVE_FRAC = 2 / 7

function smoothstep(x: number): number {
  return x * x * (3 - 2 * x)
}

export interface CycleInfo {
  /** Completed index steps */
  step: number
  /** 0..1 eased progress of the current index move (1 = settled at station) */
  moveEase: number
  /** True while bodies are parked and robots should be welding */
  welding: boolean
}

export function cycleInfo(t: number): CycleInfo {
  const c = t / CYCLE_SEC
  const step = Math.floor(c)
  const f = c - step
  const moveEase = f < MOVE_FRAC ? smoothstep(f / MOVE_FRAC) : 1
  const welding = f > 0.38 && f < 0.95
  return { step, moveEase, welding }
}
