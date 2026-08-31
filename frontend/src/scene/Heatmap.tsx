import { useEffect, useMemo, useState } from 'react'
import { DataTexture, LinearFilter, RGBAFormat } from 'three'
import { fetchHeatmap } from '../api'
import { useFactoryStore } from '../store'
import type { HeatmapDto } from '../types'

// Colour ramp stops (blue -> cyan -> green -> yellow -> red), 0..255.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [30, 64, 175]],
  [0.25, [14, 165, 233]],
  [0.5, [34, 197, 94]],
  [0.75, [234, 179, 8]],
  [1.0, [239, 68, 68]],
]

function rampColor(n: number): [number, number, number] {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i]
    const [b, cb] = STOPS[i + 1]
    if (n <= b) {
      const f = (n - a) / (b - a || 1)
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * f),
        Math.round(ca[1] + (cb[1] - ca[1]) * f),
        Math.round(ca[2] + (cb[2] - ca[2]) * f),
      ]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

/**
 * Logistics density heatmap: bins recent tag positions into a floor grid and
 * paints it as a single DataTexture plane over the campus (one draw call).
 */
export function Heatmap() {
  const show = useFactoryStore((s) => s.layers.heatmap)
  const minutes = useFactoryStore((s) => s.replayMinutes)
  const [data, setData] = useState<HeatmapDto | null>(null)

  useEffect(() => {
    if (!show) {
      setData(null)
      return
    }
    let alive = true
    const load = () =>
      fetchHeatmap(Math.max(minutes, 30), 4)
        .then((d) => alive && setData(d))
        .catch(() => {})
    load()
    const id = setInterval(load, 6000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [show, minutes])

  const tex = useMemo(() => {
    if (!data) return null
    const { cols, rows, cells, max } = data
    const arr = new Uint8Array(cols * rows * 4)
    for (const { c, r, v } of cells) {
      const n = Math.min(1, Math.pow(v / (max || 1), 0.6))
      // flip row so grid +z lines up with world +z on the flat plane
      const idx = ((rows - 1 - r) * cols + c) * 4
      const [R, G, B] = rampColor(n)
      arr[idx] = R
      arr[idx + 1] = G
      arr[idx + 2] = B
      arr[idx + 3] = Math.round(90 + n * 150)
    }
    const t = new DataTexture(arr, cols, rows, RGBAFormat)
    t.flipY = false
    t.minFilter = LinearFilter
    t.magFilter = LinearFilter
    t.needsUpdate = true
    return t
  }, [data])

  if (!show || !data || !tex) return null
  const w = data.cols * data.cell
  const d = data.rows * data.cell
  const cx = data.minX + w / 2
  const cz = data.minZ + d / 2

  return (
    <mesh rotation-x={-Math.PI / 2} position={[cx, 0.06, cz]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}
