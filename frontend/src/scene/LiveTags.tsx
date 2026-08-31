import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { Group, Vector3 } from 'three'
import { useFactoryStore } from '../store'
import type { TagKind } from '../types'

export const TAG_COLOR: Record<TagKind, string> = {
  operator: '#f97316',
  forklift: '#38bdf8',
  tugger: '#a78bfa',
  agv: '#34d399',
}

const TAG_LABEL: Record<TagKind, string> = {
  operator: 'Operator',
  forklift: 'Forklift',
  tugger: 'Tugger',
  agv: 'AGV',
}

interface TagView {
  id: string
  kind: TagKind
  name: string
  x: number
  z: number
  online: boolean
}

/** One moving RTLS marker. Smoothly lerps toward its target so 0.5 Hz updates
 *  (and replay frame steps) read as continuous motion. */
function TagMarker({ tag, showLabel }: { tag: TagView; showLabel: boolean }) {
  const ref = useRef<Group>(null)
  const target = useRef(new Vector3(tag.x, 0, tag.z))
  const inited = useRef(false)
  target.current.set(tag.x, 0, tag.z)

  useFrame(() => {
    const g = ref.current
    if (!g) return
    if (!inited.current) {
      g.position.copy(target.current)
      inited.current = true
    } else {
      g.position.lerp(target.current, 0.18)
    }
  })

  const color = tag.online ? TAG_COLOR[tag.kind] : '#6b7280'
  const isPerson = tag.kind === 'operator'

  return (
    <group ref={ref}>
      {isPerson ? (
        <>
          <mesh position={[0, 0.6, 0]} castShadow>
            <capsuleGeometry args={[0.22, 0.7, 4, 10]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={tag.online ? 0.25 : 0}
            />
          </mesh>
          <mesh position={[0, 1.2, 0]} castShadow>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial color="#f1d3b0" />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.38, 0]} castShadow>
            <boxGeometry args={[1.5, 0.62, 0.95]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={tag.online ? 0.2 : 0}
              metalness={0.3}
              roughness={0.5}
            />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.22, 8]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.2} />
          </mesh>
        </>
      )}
      {/* Ground ring so tags pop against the floor from far away */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.5, 0.78, 22]} />
        <meshBasicMaterial color={color} transparent opacity={tag.online ? 0.6 : 0.22} />
      </mesh>
      {showLabel && (
        <Billboard position={[0, isPerson ? 1.75 : 1.35, 0]}>
          <Text
            fontSize={0.48}
            color="#111827"
            outlineWidth={0.03}
            outlineColor="#ffffff"
            anchorY="bottom"
          >
            {tag.name}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

/** All live (or replayed) movable tags: operators, forklifts, tuggers, AGVs. */
export function LiveTags() {
  const show = useFactoryStore((s) => s.layers.people)
  const showLabel = useFactoryStore((s) => s.layers.labels)
  const replayMode = useFactoryStore((s) => s.replayMode)
  const positions = useFactoryStore((s) => s.positions)
  const frames = useFactoryStore((s) => s.frames)
  const frameIndex = useFactoryStore((s) => s.frameIndex)

  const tags: TagView[] = useMemo(() => {
    if (replayMode && frames && frames[frameIndex]) {
      return frames[frameIndex].tags.map((t) => ({
        id: t.id,
        kind: t.kind,
        x: t.x,
        z: t.z,
        online: t.online,
        name: positions[t.id]?.name ?? TAG_LABEL[t.kind],
      }))
    }
    return Object.values(positions)
  }, [replayMode, frames, frameIndex, positions])

  if (!show) return null
  return (
    <group>
      {tags.map((t) => (
        <TagMarker key={t.id} tag={t} showLabel={showLabel} />
      ))}
    </group>
  )
}
