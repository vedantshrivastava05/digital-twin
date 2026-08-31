import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { useMachineRuntime } from '../../store'
import { GA_LINE_ID, cycleInfo, getLineClock } from '../lineClock'
import { SHOP_LEAD, colorForBody } from '../paintQueue'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const SPAN = 52
const SLOTS = 8
const TRACK_Y = 5.4
/** Doors travel in pairs (one car's left + right leaf per hanger) and must stay
 *  in the colour of the body they came off. */

/**
 * Door-off hanger line: the doors come off the painted body at the head of trim
 * and travel the hall on their own overhead monorail in protective sleeves,
 * rejoining the car near the end of final assembly. Runs on the GA line clock so
 * the doors index in step with the bodies below.
 */
export function DoorLine({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const hangers = useRef<(Group | null)[]>([])
  const leafMats = useRef<(MeshStandardMaterial | null)[]>([])
  const clock = getLineClock(GA_LINE_ID)

  useFrame(() => {
    // The GA carrier line owns this clock; the door hangers only read it.
    const { step, moveEase } = cycleInfo(clock.t)
    hangers.current.forEach((h, i) => {
      if (!h) return
      const frac = ((i + step + moveEase) % SLOTS) / SLOTS
      h.position.x = -SPAN / 2 + frac * SPAN
      // Gentle sway as the hanger indexes along the rail.
      h.rotation.z = Math.sin((frac + i) * Math.PI * 2) * 0.045
      const colour = colorForBody(step + i + SHOP_LEAD.assembly)
      leafMats.current[i * 2]?.color.set(colour)
      leafMats.current[i * 2 + 1]?.color.set(colour)
    })
  })

  const posts = Array.from({ length: 9 }, (_, i) => -SPAN / 2 + (i * SPAN) / 8)

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[SPAN / 2 + 0.8, 0.1, 0]}
      labelY={6.2}
      noPlinth
    >
      {/* Monorail beam hung from the roof steel on drop rods */}
      <mesh position={[0, TRACK_Y, 0]} castShadow>
        <boxGeometry args={[SPAN + 3, 0.3, 0.28]} />
        <meshStandardMaterial color="#6b7484" metalness={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[0, TRACK_Y - 0.24, 0]}>
        <boxGeometry args={[SPAN + 3, 0.14, 0.44]} />
        <meshStandardMaterial color="#2a313d" metalness={0.4} roughness={0.5} />
      </mesh>
      {posts.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, TRACK_Y + 1.3, 0]}>
            <boxGeometry args={[0.09, 2.4, 0.09]} />
            <meshStandardMaterial color="#4a5260" metalness={0.35} roughness={0.6} />
          </mesh>
          <mesh position={[0, TRACK_Y + 0.32, 0]}>
            <boxGeometry args={[0.5, 0.14, 0.5]} />
            <meshStandardMaterial color="#4a5260" />
          </mesh>
        </group>
      ))}

      {/* Hangers, each carrying a car's pair of door leaves in white sleeves */}
      {Array.from({ length: SLOTS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            hangers.current[i] = el
          }}
        >
          {/* Trolley + drop hook */}
          <mesh position={[0, TRACK_Y - 0.05, 0]}>
            <boxGeometry args={[0.42, 0.26, 0.42]} />
            <meshStandardMaterial color="#252c38" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, TRACK_Y - 0.9, 0]}>
            <boxGeometry args={[0.07, 1.5, 0.07]} />
            <meshStandardMaterial color="#20242d" />
          </mesh>
          {/* Cross bar the two leaves hang from */}
          <mesh position={[0, TRACK_Y - 1.7, 0]}>
            <boxGeometry args={[0.14, 0.14, 1.7]} />
            <meshStandardMaterial color="#3b4250" metalness={0.4} roughness={0.5} />
          </mesh>
          {[0.62, -0.62].map((z, li) => (
            <group key={z} position={[0, TRACK_Y - 2.55, z]}>
              {/* Painted door leaf */}
              <mesh castShadow>
                <boxGeometry args={[1.05, 1.5, 0.09]} />
                <meshStandardMaterial
                  ref={(el) => {
                    leafMats.current[i * 2 + li] = el
                  }}
                  color={colorForBody(i + SHOP_LEAD.assembly)}
                  metalness={0.55}
                  roughness={0.3}
                />
              </mesh>
              {/* Window aperture */}
              <mesh position={[0, 0.42, 0.05]}>
                <boxGeometry args={[0.68, 0.5, 0.02]} />
                <meshStandardMaterial color="#0f1319" roughness={0.5} />
              </mesh>
              {/* Protective sleeve over the outer face */}
              <mesh position={[0, -0.05, z > 0 ? 0.07 : -0.07]}>
                <boxGeometry args={[1.12, 1.2, 0.02]} />
                <meshStandardMaterial
                  color="#f4f6f8"
                  transparent
                  opacity={0.55}
                  roughness={0.9}
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </MachineShell>
  )
}
