import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { GA_LINE_ID, cycleInfo, getLineClock } from '../lineClock'
import { SHOP_LEAD, colorForBody } from '../paintQueue'
import { biwGeometry } from '../BodyInWhite'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const SPAN = 56
const NUM_SLOTS = 8
const TRACK_Y = 4.7
const BODY_Y = 1.35

/** Bodies arriving here are already painted, so their colour comes from the
 *  order book — the same spec the paint shop sprayed a few bodies ago. */

/**
 * General/final assembly carrier line: painted car bodies hang from an overhead
 * power-and-free conveyor and index down the hall past line-side fitment
 * stations (doors, wheels, bumpers get fitted here). Advances its OWN line clock
 * (GA_LINE_ID) that the marriage/decking station reads.
 */
export function FinalAssemblyLine({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const carriers = useRef<(Group | null)[]>([])
  const bodyMats = useRef<(MeshStandardMaterial | null)[]>([])
  const clock = getLineClock(GA_LINE_ID)
  const geom = useMemo(() => biwGeometry(), [])

  useFrame((_, dt) => {
    clock.t += dt * statusSpeed(status)
    const { step, moveEase } = cycleInfo(clock.t)
    carriers.current.forEach((c, i) => {
      if (!c) return
      const frac = ((i + step + moveEase) % NUM_SLOTS) / NUM_SLOTS
      c.position.x = -SPAN / 2 + frac * SPAN
      const mat = bodyMats.current[i]
      if (mat) mat.color.set(colorForBody(step + i + SHOP_LEAD.assembly))
    })
  })

  const posts = Array.from({ length: 9 }, (_, i) => -SPAN / 2 + (i * SPAN) / 8)

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[SPAN / 2 + 0.6, 0.1, 1.6]}
      labelY={5.6}
      noPlinth
    >
      {/* Overhead conveyor track + support posts */}
      {posts.map((x) => (
        <mesh key={x} position={[x, TRACK_Y / 2, -1.4]} castShadow>
          <boxGeometry args={[0.3, TRACK_Y, 0.3]} />
          <meshStandardMaterial color="#3f4a5e" metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      <mesh position={[0, TRACK_Y, 0]} castShadow>
        <boxGeometry args={[SPAN + 2, 0.35, 0.35]} />
        <meshStandardMaterial color="#5b6577" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, TRACK_Y - 0.28, 0]}>
        <boxGeometry args={[SPAN + 2, 0.16, 0.5]} />
        <meshStandardMaterial color="#2a313d" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Cross arms tying the track to the posts */}
      {posts.map((x) => (
        <mesh key={`arm-${x}`} position={[x, TRACK_Y, -0.7]}>
          <boxGeometry args={[0.2, 0.2, 1.6]} />
          <meshStandardMaterial color="#3f4a5e" />
        </mesh>
      ))}

      {/* Line-side fitment stanchions with balancer tools, in the gaps between
          the dedicated fitment stations */}
      {[-17.5, -3.5, 10.5, 24.5].map((x) => (
        <group key={`fit-${x}`} position={[x, 0, 2.6]}>
          <mesh position={[0, 1.4, 0]} castShadow>
            <boxGeometry args={[0.18, 2.8, 0.18]} />
            <meshStandardMaterial color="#8a929e" />
          </mesh>
          <mesh position={[-0.7, 2.7, 0]}>
            <boxGeometry args={[1.4, 0.12, 0.12]} />
            <meshStandardMaterial color="#8a929e" />
          </mesh>
          <mesh position={[-1.3, 2.2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.9, 6]} />
            <meshStandardMaterial color="#e6b800" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh position={[-1.3, 1.7, 0]}>
            <boxGeometry args={[0.22, 0.2, 0.22]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
        </group>
      ))}

      {/* Hanging carriers, each cradling a painted body */}
      {Array.from({ length: NUM_SLOTS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            carriers.current[i] = el
          }}
        >
          {/* Trolley on the track */}
          <mesh position={[0, TRACK_Y - 0.05, 0]}>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshStandardMaterial color="#252c38" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Suspension straps down to the cradle */}
          {[-1.5, 1.5].map((dx) => (
            <mesh key={dx} position={[dx, (TRACK_Y + BODY_Y) / 2, 0]}>
              <boxGeometry args={[0.08, TRACK_Y - BODY_Y, 0.08]} />
              <meshStandardMaterial color="#20242d" />
            </mesh>
          ))}
          {/* Cradle bars under the body */}
          {[-0.65, 0.65].map((z) => (
            <mesh key={z} position={[0, BODY_Y - 0.15, z]}>
              <boxGeometry args={[3.4, 0.12, 0.12]} />
              <meshStandardMaterial color="#3b4250" />
            </mesh>
          ))}
          {/* Painted body, in the colour its order was sold in */}
          <mesh geometry={geom} position={[0, BODY_Y, 0]} castShadow>
            <meshStandardMaterial
              ref={(el) => {
                bodyMats.current[i] = el
              }}
              color={colorForBody(i + SHOP_LEAD.assembly)}
              metalness={0.55}
              roughness={0.28}
            />
          </mesh>
        </group>
      ))}
    </MachineShell>
  )
}
