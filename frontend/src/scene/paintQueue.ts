import { useCallback, useEffect, useRef, useState } from 'react'
import { useFactoryStore } from '../store'

/**
 * Customer colour, threaded end to end.
 *
 * The order book decides what colour each car is built in. The paint shop sprays
 * to that spec and the same colour then has to show up on the same body in
 * assembly, in the check hall and on the car parked in the dispatch yard — so
 * every shop reads its body colour from this one queue instead of picking its
 * own palette.
 *
 * Bodies are numbered along the build sequence; a shop asks for the colour of
 * body N, offsetting N by how far downstream it sits from paint.
 */

/** Fallback spec if the order book has no colours yet. */
const DEFAULT_QUEUE = [
  '#b6bcc4',
  '#1e2f52',
  '#7f1d1d',
  '#12151b',
  '#e8ebee',
  '#0e4d3a',
  '#8c1d3f',
  '#4b5563',
]

let queue: string[] = DEFAULT_QUEUE
let names: (string | null)[] = DEFAULT_QUEUE.map(() => null)

/** The colour of the Nth body in the build sequence. */
export function colorForBody(n: number): string {
  const len = queue.length
  return queue[((Math.floor(n) % len) + len) % len]
}

/** The marketing name of the Nth body's colour, when the order book gave one. */
export function colorNameForBody(n: number): string | null {
  const len = names.length
  return names[((Math.floor(n) % len) + len) % len]
}

/** The whole queue, for palettes (dispatch yard blocks, door stock, etc.). */
export function paintQueue(): string[] {
  return queue
}

/**
 * How many bodies downstream of the paint booth each shop sits. Used so the
 * colour appears to travel with the car: what paint sprays now shows up in
 * assembly a few bodies later.
 */
export const SHOP_LEAD = {
  paint: 0,
  assembly: 3,
  check: 6,
  dispatch: 9,
} as const

/**
 * For stations that hold one car per cycle (the check-hall rigs): returns the
 * current car's colour plus a tick function to call each frame. The colour only
 * changes when a new car rolls in, so this costs one render per cycle.
 */
export function useCarColour(lead: number) {
  const [colour, setColour] = useState(() => colorForBody(lead))
  const cycle = useRef(-1)
  const tick = useCallback(
    (t: number, cycleSec: number) => {
      const n = Math.floor(t / cycleSec)
      if (n === cycle.current) return
      cycle.current = n
      setColour(colorForBody(n + lead))
    },
    [lead],
  )
  return [colour, tick] as const
}

/**
 * Keeps the queue in sync with the order book. Mounted once near the app root;
 * scene components read the queue directly so they do not re-render on poll.
 */
export function usePaintQueueSync() {
  const orders = useFactoryStore((s) => s.orders)
  useEffect(() => {
    // Sorted so the build sequence is stable between polls.
    const spec = orders
      .filter((o) => o.color && o.status !== 'done')
      .sort((a, b) => a.id.localeCompare(b.id))
    if (spec.length === 0) {
      queue = DEFAULT_QUEUE
      names = DEFAULT_QUEUE.map(() => null)
      return
    }
    queue = spec.map((o) => o.color as string)
    names = spec.map((o) => o.color_name ?? null)
  }, [orders])
}
