import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

const STEEL = '#5b6577'
const DARK = '#333a45'

function Press() {
  const phase = useRef(0)
  const ram = useRef<Mesh>(null)
  const speed = useRef(1)
  useFrame((_, dt) => {
    phase.current += dt * speed.current * 2.2
    if (ram.current) {
      const s = (Math.sin(phase.current) + 1) / 2
      ram.current.position.y = 1.15 + Math.pow(s, 0.6) * 0.7
    }
  })
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[2.2, 0.7, 1.5]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]} castShadow>
          <boxGeometry args={[0.4, 2.3, 0.7]} />
          <meshStandardMaterial color={STEEL} />
        </mesh>
      ))}
      <mesh position={[0, 3.0, 0]} castShadow>
        <boxGeometry args={[2.5, 0.6, 0.9]} />
        <meshStandardMaterial color="#3f4a5e" />
      </mesh>
      <mesh ref={ram} position={[0, 1.85, 0]} castShadow>
        <boxGeometry args={[1.1, 0.6, 0.8]} />
        <meshStandardMaterial color="#8b96a8" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  )
}

function Cnc() {
  const chuck = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (chuck.current) chuck.current.rotation.y += dt * 15
  })
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[2.8, 1.7, 2.2]} />
        <meshStandardMaterial color="#526075" />
      </mesh>
      <mesh position={[0, 1.15, 1.12]}>
        <planeGeometry args={[1.6, 0.9]} />
        <meshStandardMaterial color="#151b24" roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.0, 0]} castShadow>
        <boxGeometry args={[2.4, 0.5, 1.6]} />
        <meshStandardMaterial color="#42506b" />
      </mesh>
      <mesh ref={chuck} position={[1.1, 1.5, 0.9]}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
        <meshStandardMaterial color="#c8d0dc" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

function Conveyor() {
  const boxes = useRef<Group>(null)
  const prog = useRef(Math.random())
  useFrame((_, dt) => {
    prog.current = (prog.current + dt * 0.15) % 1
    boxes.current?.children.forEach((box, i) => {
      const frac = (prog.current + i / 3) % 1
      box.position.x = -1.9 + frac * 3.8
    })
  })
  return (
    <group>
      {[-1.7, 1.7].map((x) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.42, z]}>
            <boxGeometry args={[0.1, 0.65, 0.1]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[4.2, 0.12, 1.2]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <group ref={boxes}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[0.5, 0.45, 0.5]} />
            <meshStandardMaterial color={['#b58a55', '#c79a63', '#a07845'][i]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Rack() {
  return (
    <group>
      {[-1.9, 0, 1.9].map((x) =>
        [-0.55, 0.55].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.5, z]} castShadow>
            <boxGeometry args={[0.12, 3, 0.12]} />
            <meshStandardMaterial color="#2563eb" />
          </mesh>
        )),
      )}
      {[0.5, 1.5, 2.5].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[3.9, 0.09, 1.25]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      ))}
      {[0.62, 1.62].map((y) =>
        [-1.1, 0.2, 1.3].map((x) => (
          <mesh key={`${x}${y}`} position={[x, y + 0.22, 0]} castShadow>
            <boxGeometry args={[0.85, 0.45, 1.0]} />
            <meshStandardMaterial color="#9aa3b2" />
          </mesh>
        )),
      )}
    </group>
  )
}

function Tank() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 3, 24]} />
        <meshStandardMaterial color="#c8d0dc" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <sphereGeometry args={[1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c8d0dc" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[1.05, 1.2, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.4, 8]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  )
}

function Panel() {
  return (
    <group>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[1.3, 2.0, 0.6]} />
        <meshStandardMaterial color="#cdd2d8" />
      </mesh>
      <mesh position={[0, 1.35, 0.31]}>
        <planeGeometry args={[0.8, 0.55]} />
        <meshStandardMaterial color="#0e3a4a" emissive="#155e75" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.6, 0.31]}>
        <planeGeometry args={[0.9, 0.5]} />
        <meshStandardMaterial color="#8b95a3" />
      </mesh>
    </group>
  )
}

const BODIES: Record<string, () => React.JSX.Element> = {
  press: Press,
  cnc: Cnc,
  conveyor: Conveyor,
  rack: Rack,
  tank: Tank,
  panel: Panel,
}

interface GenericMachineProps {
  instance: AssetInstanceDto
  asset: AssetDto
}

/** Catalog machines placed via the manual builder (press, CNC, conveyor, rack, tank, panel) */
export function GenericMachine({ instance, asset }: GenericMachineProps) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const Body = BODIES[asset.category] ?? Panel
  const wrapper = useRef<Group>(null)

  useFrame(() => {
    // Freeze animated children when not running (cheap global speed control)
    if (wrapper.current) {
      const speed = statusSpeed(status)
      wrapper.current.userData.speed = speed
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.2, 0.1, asset.footprint_d / 2 - 0.2]}
    >
      <group ref={wrapper}>
        <Body />
      </group>
    </MachineShell>
  )
}
