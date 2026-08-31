import { useEffect, useRef } from 'react'
import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import { useFactoryStore } from '../store'
import { campusExtent } from './campusLayout'

const EYE_HEIGHT = 1.7
const EXT = campusExtent(10)

/** First-person walk mode: WASD + mouse look, Esc to exit */
export function WalkControls() {
  const controls = useRef<PointerLockControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const setWalkMode = useFactoryStore((s) => s.setWalkMode)
  const keys = useRef<Record<string, boolean>>({})
  const forward = useRef(new Vector3())
  const right = useRef(new Vector3())

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, 20)
    const lockTimer = setTimeout(() => controls.current?.lock(), 50)
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      clearTimeout(lockTimer)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [camera])

  useFrame((_, dt) => {
    const k = keys.current
    const speed = k.ShiftLeft || k.ShiftRight ? 10 : 4.5
    const move =
      Number(k.KeyW || k.ArrowUp) - Number(k.KeyS || k.ArrowDown)
    const strafe =
      Number(k.KeyD || k.ArrowRight) - Number(k.KeyA || k.ArrowLeft)
    if (move === 0 && strafe === 0) return

    camera.getWorldDirection(forward.current)
    forward.current.y = 0
    forward.current.normalize()
    right.current.set(-forward.current.z, 0, forward.current.x)

    camera.position
      .addScaledVector(forward.current, move * speed * dt)
      .addScaledVector(right.current, strafe * speed * dt)
    camera.position.x = Math.max(EXT.minX, Math.min(EXT.maxX, camera.position.x))
    camera.position.z = Math.max(EXT.minZ, Math.min(EXT.maxZ, camera.position.z))
    camera.position.y = EYE_HEIGHT
  })

  return <PointerLockControls ref={controls} onUnlock={() => setWalkMode(false)} />
}
