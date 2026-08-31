import { useState, type ReactNode, type RefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import { Billboard, Text } from '@react-three/drei'
import { STATUS_COLORS } from '../../constants'
import type { AssetInstanceDto, MachineStatus } from '../../types'
import { useFactoryStore } from '../../store'

function StackLight({
  status,
  position,
}: {
  status: MachineStatus
  position: [number, number, number]
}) {
  const lamps: { key: MachineStatus; y: number }[] = [
    { key: 'running', y: 1.02 },
    { key: 'idle', y: 1.18 },
    { key: 'warning', y: 1.34 },
    { key: 'down', y: 1.5 },
  ]
  return (
    <group position={position}>
      <mesh position={[0, 0.475, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.95, 8]} />
        <meshStandardMaterial color="#333a45" />
      </mesh>
      {lamps.map((lamp) => (
        <mesh key={lamp.key} position={[0, lamp.y, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.15, 12]} />
          <meshStandardMaterial
            color={STATUS_COLORS[lamp.key]}
            emissive={STATUS_COLORS[lamp.key]}
            emissiveIntensity={status === lamp.key ? 2.2 : 0}
          />
        </mesh>
      ))}
    </group>
  )
}

interface MachineShellProps {
  instance: AssetInstanceDto
  footprint: [number, number]
  status: MachineStatus
  lampOffset: [number, number, number]
  labelY?: number
  children: ReactNode
  /**
   * Mobile machines (e.g. roaming forklifts) are positioned imperatively by the
   * caller each frame via `groupRef` instead of the seeded instance transform.
   * The base plinth is dropped so no pad drags along, but the label, stack light,
   * selection ring and click/hover all travel with the moving unit.
   */
  mobile?: boolean
  groupRef?: RefObject<Group | null>
  /** Suppress the floor plinth for overhead / rail-mounted machines (bridge
   *  crane, crossbar feeder) that draw their own supports. */
  noPlinth?: boolean
}

/**
 * Common wrapper for every machine: base plinth, hover cursor, click
 * selection (or pin drop in pin mode), name label layer, stack light.
 */
export function MachineShell({
  instance,
  footprint,
  status,
  lampOffset,
  labelY = 3.4,
  children,
  mobile = false,
  groupRef,
  noPlinth = false,
}: MachineShellProps) {
  const [hovered, setHovered] = useState(false)
  const select = useFactoryStore((s) => s.select)
  const selected = useFactoryStore((s) => s.selectedId === instance.id)
  const highlighted = useFactoryStore((s) => s.highlightedIds.includes(instance.id))
  const showLabels = useFactoryStore((s) => s.layers.labels)
  const showOrders = useFactoryStore((s) => s.layers.orders)
  const activeOrder = useFactoryStore((s) =>
    s.orders.find((o) => o.machine_id === instance.id && o.status === 'running'),
  )
  const [w, d] = footprint

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const { pinMode, setPendingPin, placingAssetId, zoneDrawMode } =
      useFactoryStore.getState()
    if (placingAssetId || zoneDrawMode) return
    if (pinMode) {
      setPendingPin({ x: e.point.x, y: 0, z: e.point.z, instanceId: instance.id })
    } else {
      select(instance.id)
    }
  }

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    const { editMode, placingAssetId, zoneDrawMode, setDragging } =
      useFactoryStore.getState()
    if (editMode && !placingAssetId && !zoneDrawMode) {
      e.stopPropagation()
      setDragging(instance.id)
    }
  }
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = () => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  return (
    <group
      ref={groupRef}
      position={mobile ? undefined : [instance.x, instance.y, instance.z]}
      rotation-y={mobile ? undefined : instance.rotation_y}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
    >
      {selected && (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[w + 0.6, 0.04, d + 0.6]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}
      {highlighted && !selected && (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[w + 0.6, 0.04, d + 0.6]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      )}
      {highlighted && (
        <Billboard position={[0, labelY + 1.4, 0]}>
          <Text fontSize={0.9} color="#f59e0b" outlineWidth={0.05} outlineColor="#ffffff">
            ▼
          </Text>
        </Billboard>
      )}
      {!mobile && !noPlinth && (
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <boxGeometry args={[w, 0.1, d]} />
          <meshStandardMaterial color={hovered ? '#c3ccd9' : '#aeb6c2'} />
        </mesh>
      )}
      <StackLight status={status} position={lampOffset} />
      {showLabels && (
        <Billboard position={[0, labelY, 0]}>
          <Text
            fontSize={0.52}
            color="#1f2937"
            outlineWidth={0.03}
            outlineColor="#ffffff"
            anchorY="bottom"
          >
            {instance.name}
          </Text>
        </Billboard>
      )}
      {showOrders && activeOrder && (
        <Billboard position={[0, labelY + (showLabels ? 0.75 : 0), 0]}>
          <Text
            fontSize={0.42}
            color="#0e7490"
            outlineWidth={0.035}
            outlineColor="#ffffff"
            anchorY="bottom"
          >
            {`▶ ${activeOrder.id} · ${activeOrder.product_sku} ${activeOrder.produced}/${activeOrder.qty}`}
          </Text>
        </Billboard>
      )}
      {children}
    </group>
  )
}
