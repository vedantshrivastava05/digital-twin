import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, type Group, type MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { cycleInfo, getLineClock } from '../lineClock'
import { SHOP_LEAD, colorForBody } from '../paintQueue'
import { MachineShell } from './MachineShell'
import { biwGeometry } from '../BodyInWhite'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

/** Bodies arrive in bare primer white and leave in the customer's colour. */
const RAW = new Color('#e9ebef')
const target = new Color()
const scratch = new Color()

const RAIL_Y = 5.2

/**
 * Overhead paint monorail: an I-beam power-and-free conveyor that carries car
 * bodies suspended in the air on hangers straight through the spray booth,
 * between the flanking paint robots. Bodies enter as raw white shells and are
 * progressively lacquered to the colour their order was sold in as they pass the
 * robots, then wrap back to the entry as a fresh white body.
 *
 * Motion is a power-and-free INDEX cycle synced to the shared line clock: the
 * whole train advances one pitch, then dwells while a body is parked dead-centre
 * in the booth for the flanking robots to spray, then indexes on. The clock
 * freezes when the line is down. One shared body geometry is reused for every
 * hanger; only the per-body material colour is mutated each frame, so the whole
 * line stays a handful of draw calls.
 */
export function PaintLine({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const geometry = useMemo(() => biwGeometry(), [])
  const carriers = useRef<Group>(null)
  const mats = useRef<MeshStandardMaterial[]>([])
  // Shared clock keyed by this line's id; the flanking paint robots read the
  // same clock so their spray fires exactly while a body is parked.
  const clock = getLineClock(instance.id)

  const len = asset.footprint_w
  const count = Math.max(4, Math.round(len / 9))
  const pitch = len / count

  // Paint zone in the line's local X (robots sit ~+/-7 either side of centre).
  const zoneStart = -11
  const zoneEnd = 10

  const hangerXs = useMemo(
    () => Array.from({ length: count }, (_, i) => i),
    [count],
  )
  const postXs = useMemo(
    () => [-len / 2 + 2, -len / 6, len / 6, len / 2 - 2],
    [len],
  )

  useFrame((_, dt) => {
    clock.t += dt * statusSpeed(status)
    const kids = carriers.current?.children
    if (!kids) return
    // step + eased move => bodies hold still through the dwell, then slide one
    // pitch during the move phase. The +pitch/2 offset lands a station exactly
    // on local X=0, so a body parks dead-centre in the booth every cycle.
    const { step, moveEase } = cycleInfo(clock.t)
    const advance = step + moveEase
    kids.forEach((c, i) => {
      let m = ((i + advance) * pitch + pitch / 2) % len
      if (m < 0) m += len
      const x = -len / 2 + m
      c.position.x = x
      const p = Math.min(1, Math.max(0, (x - zoneStart) / (zoneEnd - zoneStart)))
      const mat = mats.current[i]
      if (mat) {
        // Each hanger carries a specific body from the order book, so it gets
        // sprayed the colour that body was sold in.
        const bodyNo = step + i + SHOP_LEAD.paint
        target.set(colorForBody(bodyNo))
        scratch.copy(RAW).lerp(target, p)
        mat.color.copy(scratch)
        mat.metalness = 0.35 + p * 0.55
        mat.roughness = 0.62 - p * 0.4
      }
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[len / 2 - 0.8, 0.1, asset.footprint_d / 2]}
      labelY={6.4}
    >
      {/* Floor track guide under the line */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[len, 0.06, 1.1]} />
        <meshStandardMaterial color="#2c313b" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Overhead I-beam rail + support posts */}
      <mesh position={[0, RAIL_Y, 0]} castShadow>
        <boxGeometry args={[len, 0.34, 0.3]} />
        <meshStandardMaterial color="#3a4150" metalness={0.55} roughness={0.5} />
      </mesh>
      <mesh position={[0, RAIL_Y - 0.24, 0]}>
        <boxGeometry args={[len, 0.14, 0.6]} />
        <meshStandardMaterial color="#4a5260" metalness={0.5} roughness={0.55} />
      </mesh>
      {postXs.map((x) => (
        <mesh key={x} position={[x, RAIL_Y / 2, 0]} castShadow>
          <boxGeometry args={[0.22, RAIL_Y, 0.22]} />
          <meshStandardMaterial color="#4a5260" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}

      {/* Hangers, each carrying a body that gets painted along the way */}
      <group ref={carriers}>
        {hangerXs.map((i) => (
          <group key={i}>
            {/* Trolley riding the rail */}
            <mesh position={[0, RAIL_Y, 0]}>
              <boxGeometry args={[0.6, 0.32, 0.5]} />
              <meshStandardMaterial color="#5b6373" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Two drop rods to the cradle */}
            {[-1.05, 1.05].map((rx) => (
              <mesh key={rx} position={[rx, (RAIL_Y + 1.7) / 2, 0]}>
                <boxGeometry args={[0.08, RAIL_Y - 1.7, 0.08]} />
                <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.5} />
              </mesh>
            ))}
            {/* Skid cradle the body rests on */}
            <mesh position={[0, 1.62, 0]} castShadow>
              <boxGeometry args={[3.4, 0.12, 1.5]} />
              <meshStandardMaterial color="#2b3240" metalness={0.4} roughness={0.6} />
            </mesh>
            {/* The car body (paintable: white -> black) */}
            <mesh
              geometry={geometry}
              position={[0, 1.72, 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                ref={(m) => {
                  if (m) mats.current[i] = m as MeshStandardMaterial
                }}
                color="#e9ebef"
                metalness={0.35}
                roughness={0.62}
              />
            </mesh>
          </group>
        ))}
      </group>
    </MachineShell>
  )
}
