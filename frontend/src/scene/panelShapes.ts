import { ExtrudeGeometry, Path, Shape } from 'three'

/** The panel silhouettes the plant forms. `door`/`hood`/`side` cycle across the
 *  press line; `floor` is the underbody the framing cell builds the body on. */
export type PanelKind = 'door' | 'hood' | 'side' | 'floor'

const KIND_ORDER: PanelKind[] = ['door', 'hood', 'side']

/** Map a press/rack index (0-based) to a panel kind so each station forms a
 *  different recognizable part. */
export function panelKindForIndex(i: number): PanelKind {
  return KIND_ORDER[((i % 3) + 3) % 3]
}

/** Parse the trailing number from an instance id like "press-2" -> 1 (0-based). */
export function indexFromId(id: string): number {
  const m = id.match(/(\d+)\s*$/)
  return m ? Math.max(0, parseInt(m[1], 10) - 1) : 0
}

function roundedRect(
  target: Shape | Path,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
) {
  const x = cx - w / 2
  const y = cy - h / 2
  target.moveTo(x + r, y)
  target.lineTo(x + w - r, y)
  target.quadraticCurveTo(x + w, y, x + w, y + r)
  target.lineTo(x + w, y + h - r)
  target.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  target.lineTo(x + r, y + h)
  target.quadraticCurveTo(x, y + h, x, y + h - r)
  target.lineTo(x, y + r)
  target.quadraticCurveTo(x, y, x + r, y)
}

function buildShape(kind: PanelKind): Shape {
  const s = new Shape()
  if (kind === 'door') {
    roundedRect(s, 0, 0, 1.0, 1.5, 0.16)
    const win = new Path()
    roundedRect(win, 0, 0.34, 0.66, 0.52, 0.08)
    s.holes.push(win)
  } else if (kind === 'hood') {
    // Trapezoid, wider at the front edge — reads as a bonnet/hood.
    s.moveTo(-0.85, -0.62)
    s.lineTo(0.85, -0.62)
    s.lineTo(0.62, 0.62)
    s.lineTo(-0.62, 0.62)
    s.closePath()
  } else if (kind === 'side') {
    // Body side outer: a long panel with two door window openings.
    roundedRect(s, 0, 0, 2.6, 1.3, 0.16)
    const d1 = new Path()
    roundedRect(d1, -0.55, 0.16, 0.72, 0.62, 0.08)
    const d2 = new Path()
    roundedRect(d2, 0.55, 0.16, 0.72, 0.62, 0.08)
    s.holes.push(d1, d2)
  } else {
    // Underbody / floor pan: a wide rounded plate with two lightening cut-outs
    // either side of the (implied) transmission tunnel.
    roundedRect(s, 0, 0, 2.6, 1.5, 0.2)
    const h1 = new Path()
    roundedRect(h1, 0, 0.42, 1.1, 0.4, 0.12)
    const h2 = new Path()
    roundedRect(h2, 0, -0.42, 1.1, 0.4, 0.12)
    s.holes.push(h1, h2)
  }
  return s
}

const cache = new Map<PanelKind, ExtrudeGeometry>()

/** Cached extruded geometry for a stamped panel silhouette (shared across all
 *  presses/racks for performance). Laid out in the XY plane; rotate -X/2 to lay
 *  it flat on a bolster. */
export function panelGeometry(kind: PanelKind): ExtrudeGeometry {
  let g = cache.get(kind)
  if (!g) {
    g = new ExtrudeGeometry(buildShape(kind), {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    })
    g.center()
    cache.set(kind, g)
  }
  return g
}
