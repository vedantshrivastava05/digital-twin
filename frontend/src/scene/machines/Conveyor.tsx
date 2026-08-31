import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

/**
 * Belt/roller transfer conveyor: side rails on legs, a dark running belt with
 * end rollers, and totes that travel along it while the line runs. Length and
 * width follow the catalog footprint so it works for short spurs or long runs.
 */
export function Conveyor({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const rollers = useRef<Group>(null)

  const len = asset.footprint_w
  const wid = Math.min(asset.footprint_d, 1.5)

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    if (rollers.current) rollers.current.rotation.z -= dt * s * 4
  })

  const nLegs = Math.max(2, Math.round(len / 3))
  const legXs = Array.from(
    { length: nLegs },
    (_, i) => -len / 2 + 0.6 + (i * (len - 1.2)) / (nLegs - 1),
  )

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[len / 2 - 0.3, 0.1, wid / 2 + 0.2]}
      labelY={1.8}
    >
      {legXs.map((x) =>
        [-wid / 2 + 0.1, wid / 2 - 0.1].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.4, z]} castShadow>
            <boxGeometry args={[0.12, 0.8, 0.12]} />
            <meshStandardMaterial color="#333a45" />
          </mesh>
        )),
      )}
      {/* Side rails */}
      {[-wid / 2, wid / 2].map((z) => (
        <mesh key={z} position={[0, 0.86, z]} castShadow>
          <boxGeometry args={[len, 0.14, 0.08]} />
          <meshStandardMaterial color="#4a5260" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* Belt */}
      <mesh position={[0, 0.82, 0]} receiveShadow>
        <boxGeometry args={[len, 0.08, wid - 0.16]} />
        <meshStandardMaterial color="#22262e" roughness={0.9} />
      </mesh>
      {/* End rollers */}
      <group ref={rollers}>
        {[-len / 2, len / 2].map((x) => (
          <mesh key={x} position={[x, 0.82, 0]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.14, 0.14, wid - 0.14, 12]} />
            <meshStandardMaterial color="#8b96a8" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </MachineShell>
  )
}
