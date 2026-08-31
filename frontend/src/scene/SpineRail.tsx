import { useMemo } from 'react'
import { BoxGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CAMPUS_BY_ID } from './campusLayout'

/**
 * The single transport rail that threads the whole plant: one continuous track
 * running down the X spine at z=0, from the yard west of Stamping through every
 * shop (via the gable rail-gates) out to the dispatch yard east of Assembly.
 * The cross-shop transfer carriers (MaterialFlow) ride this line, so the flow
 * reads as one rail rather than a scatter of AGVs.
 */

const GAUGE = 1.5
const RAIL_Y = 0.2
const noRaycast = () => null

function box(x: number, y: number, z: number, sx: number, sy: number, sz: number): BoxGeometry {
  const g = new BoxGeometry(sx, sy, sz)
  g.translate(x, y, z)
  return g
}

export function SpineRail() {
  const geo = useMemo(() => {
    const stamp = CAMPUS_BY_ID['nd-hall-stamp']
    const ga = CAMPUS_BY_ID['nd-hall-ga']
    if (!stamp || !ga) return null
    const x0 = stamp.x - stamp.halfX - 12
    const x1 = ga.x + ga.halfX + 12
    const len = x1 - x0
    const cx = (x0 + x1) / 2

    const rails = mergeGeometries([
      box(cx, RAIL_Y, GAUGE / 2, len, 0.16, 0.12),
      box(cx, RAIL_Y, -GAUGE / 2, len, 0.16, 0.12),
    ])

    const sleepers: BoxGeometry[] = []
    for (let x = x0; x <= x1; x += 2.2) sleepers.push(box(x, 0.09, 0, 0.5, 0.14, GAUGE + 0.9))
    const ties = mergeGeometries(sleepers)
    sleepers.forEach((g) => g.dispose())

    return { rails, ties }
  }, [])

  if (!geo) return null
  return (
    <group>
      <mesh geometry={geo.rails} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color="#8a929e" metalness={0.65} roughness={0.38} />
      </mesh>
      <mesh geometry={geo.ties} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color="#3a3f47" roughness={0.9} />
      </mesh>
    </group>
  )
}
