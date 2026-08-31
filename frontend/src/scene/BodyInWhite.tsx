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
 * Procedural car "body-in-white" (BIW) — the bare welded steel skeleton that
 * rides the skids down the body line: floor pan, front/rear rails, rockers,
 * A/B/C pillars, roof rails + bows, door-ring openings and wheel arches.
 *
 * No paint, no glass, no wheels — just the structure, matched to CarBody's
 * footprint (~3.6 long x 1.65 wide, origin at the underbody) so it drops onto
 * the skids exactly where the finished-car placeholder used to sit.
 *
 * Every frame member is a thin box; the whole skeleton is welded into ONE
 * merged BufferGeometry so each car on the line costs a single draw call. The
 * geometry is identical for every shell, so it is built once and shared across
 * all instances (keeps the Mac happy even with a full line).
 */

const UP = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)

/** Axis-aligned frame member centered at (x,y,z). */
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

/** A square-section beam running between two points (for angled pillars/arches). */
function beam(
  a: [number, number, number],
  b: [number, number, number],
  t = 0.09,
): BoxGeometry {
  const va = new Vector3(...a)
  const vb = new Vector3(...b)
  const dir = new Vector3().subVectors(vb, va)
  const len = dir.length()
  const g = new BoxGeometry(t, len, t)
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize())
  const mid = new Vector3().addVectors(va, vb).multiplyScalar(0.5)
  g.applyMatrix4(new Matrix4().compose(mid, q, ONE))
  return g
}

function buildGeometry(): BufferGeometry {
  const p: BoxGeometry[] = []

  // ---- Underbody / floor pan ----
  p.push(box(-0.05, 0.14, 0, 3.2, 0.1, 1.42)) // main floor pan
  p.push(box(-0.05, 0.24, 0, 2.7, 0.15, 0.3)) // transmission tunnel spine
  p.push(box(0.35, 0.19, 0, 0.13, 0.1, 1.34)) // front floor cross member
  p.push(box(-0.85, 0.19, 0, 0.13, 0.1, 1.34)) // rear seat cross member

  // ---- Rocker sills (both sides) ----
  for (const z of [-0.72, 0.72]) {
    p.push(box(-0.05, 0.23, z, 3.05, 0.16, 0.14))
  }

  // ---- Front structure (engine bay) ----
  for (const z of [-0.46, 0.46]) {
    p.push(box(1.2, 0.34, z, 1.15, 0.13, 0.13)) // front longitudinal rails
  }
  p.push(box(1.76, 0.42, 0, 0.13, 0.16, 1.05)) // front bumper cross beam
  p.push(box(1.55, 0.62, 0, 0.1, 0.08, 1.0)) // upper radiator tie bar
  for (const z of [-0.5, 0.5]) {
    p.push(box(0.98, 0.6, z, 0.3, 0.5, 0.3)) // strut towers
  }

  // ---- Cowl / firewall bulkhead (engine bay <-> cabin) ----
  p.push(box(0.6, 0.5, 0, 0.12, 0.64, 1.36)) // firewall panel
  p.push(box(0.6, 0.83, 0, 0.1, 0.08, 1.36)) // cowl top / windshield base

  // ---- Rear structure ----
  for (const z of [-0.46, 0.46]) {
    p.push(box(-1.3, 0.34, z, 0.9, 0.13, 0.13)) // rear longitudinal rails
  }
  p.push(box(-1.76, 0.42, 0, 0.13, 0.16, 1.05)) // rear bumper cross beam
  p.push(box(-0.95, 0.55, 0, 0.12, 0.68, 1.36)) // rear bulkhead / parcel-shelf frame

  // ---- Beltline rails (window base, both sides) ----
  for (const z of [-0.68, 0.68]) {
    p.push(box(-0.2, 0.83, z, 1.5, 0.1, 0.1))
  }

  // ---- Pillars + roof rails (both sides) ----
  for (const z of [-0.66, 0.66]) {
    const zr = z * (0.6 / 0.66) // roof tumblehome: slightly narrower than body
    // A-pillar (windshield frame): cowl top -> roof front
    p.push(beam([0.58, 0.85, z], [0.14, 1.24, zr], 0.09))
    // B-pillar (center, near vertical): sill -> roof
    p.push(beam([-0.3, 0.25, z], [-0.3, 1.24, zr], 0.1))
    // C-pillar (rear, angled): beltline rear -> roof rear
    p.push(beam([-0.95, 0.85, z], [-0.5, 1.24, zr], 0.09))
    // Roof rail (longitudinal): joins A/B/C pillar tops
    p.push(box(-0.18, 1.26, zr, 0.68, 0.09, 0.09))
  }

  // ---- Roof bows (cross members) ----
  for (const x of [0.14, -0.18, -0.5]) {
    p.push(box(x, 1.27, 0, 0.08, 0.07, 1.24))
  }

  // ---- Wheel arches (segmented half-hoops, both sides, front + rear) ----
  for (const z of [-0.78, 0.78]) {
    for (const cx of [1.02, -1.18]) {
      const r = 0.44
      const segs = 5
      const a0 = Math.PI * 0.1
      const a1 = Math.PI * 0.9
      let prev: [number, number, number] | null = null
      for (let i = 0; i <= segs; i++) {
        const a = a0 + (a1 - a0) * (i / segs)
        const pt: [number, number, number] = [
          cx + Math.cos(a) * r,
          0.15 + Math.sin(a) * r,
          z,
        ]
        if (prev) p.push(beam(prev, pt, 0.07))
        prev = pt
      }
    }
  }

  const merged = mergeGeometries(p)
  p.forEach((g) => g.dispose())
  return merged
}

let SHARED: BufferGeometry | null = null
/** The shared body-in-white geometry (built once, reused by every shell/line). */
export function biwGeometry(): BufferGeometry {
  if (!SHARED) SHARED = buildGeometry()
  return SHARED
}

/**
 * A single bare-steel body-in-white shell. Drop it where a CarBody sat on the
 * body line; it shares one geometry across every instance for cheap rendering.
 */
export function BodyInWhite() {
  const geometry = useMemo(() => biwGeometry(), [])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#aeb4bc" metalness={0.9} roughness={0.42} />
    </mesh>
  )
}
