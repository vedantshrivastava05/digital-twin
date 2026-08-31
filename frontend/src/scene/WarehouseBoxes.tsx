import { useMemo } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { WH } from './warehouseFlow'

const CRATE = ['#b58a55', '#c79a63', '#9aa3b2', '#a9865a']

interface Crate {
  x: number
  y: number
  z: number
  s: number
  c: string
}

/**
 * A stacked cluster of crates at a buffer point. Deterministic (seeded by a
 * simple hash) so it renders once and stays put — the flow is a fixed-look
 * continuous loop, so these piles are steady decor that the forklifts appear to
 * feed from / stack into, rather than a live-counted inventory.
 */
function buildPile(
  cx: number,
  cz: number,
  cols: number,
  rows: number,
  layers: number,
  base = 0.9,
): Crate[] {
  const out: Crate[] = []
  const pitch = base + 0.18
  for (let l = 0; l < layers; l++) {
    // Each higher layer shrinks its footprint for a natural pyramid.
    const c = Math.max(1, cols - l)
    const r = Math.max(1, rows - l)
    for (let i = 0; i < c; i++) {
      for (let j = 0; j < r; j++) {
        const h = (i * 7 + j * 13 + l * 5) % 3
        out.push({
          x: cx + (i - (c - 1) / 2) * pitch,
          z: cz + (j - (r - 1) / 2) * pitch,
          y: base / 2 + l * base,
          s: base,
          c: CRATE[h % CRATE.length],
        })
      }
    }
  }
  return out
}

function Pile({ crates }: { crates: Crate[] }) {
  return (
    <group>
      {crates.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.s, b.s, b.s * 1.05]} />
          <meshStandardMaterial color={b.c} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Static crate stacks at the receiving pile, shelf staging and dispatch drop. */
export function WarehouseBoxes() {
  // Bigger, obvious receiving pile right where the inbound rail rolls crates off.
  const receiving = useMemo(() => buildPile(WH.PILE.x, WH.PILE.z, 4, 3, 3, 1.0), [])
  const staging = useMemo(() => buildPile(WH.STAGE.x, WH.STAGE.z, 2, 2, 2, 0.9), [])
  const dispatch = useMemo(() => buildPile(WH.MFG.x, WH.MFG.z, 2, 2, 1, 0.9), [])

  return (
    <group>
      <Pile crates={receiving} />
      <Pile crates={staging} />
      <Pile crates={dispatch} />
      <Billboard position={[WH.PILE.x, 4.6, WH.PILE.z]}>
        <Text fontSize={0.72} color="#b45309" outlineWidth={0.04} outlineColor="#ffffff">
          GOODS IN
        </Text>
      </Billboard>
    </group>
  )
}
