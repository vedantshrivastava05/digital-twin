import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, DoubleSide, Mesh, Plane, Vector3, type Material, type Object3D } from 'three'

const MODEL_URL = '/models/warehouse.glb'

/**
 * Downloaded warehouse shell (CGTrader, "warehouse6" by AzkA3D) used as the
 * factory building around our data-driven machines.
 *
 * The raw export scale/origin don't matter: the model is measured once, then
 * centered, rested on the floor and uniformly scaled to the plant footprint.
 * A horizontal clipping plane lops off the roof and upper walls so the interior
 * and the machines stay visible from the default 3/4 camera. Every mesh has its
 * raycast disabled so taps always fall through to the machines.
 *
 * Tunables (all one-liners):
 *   targetSpan  longest horizontal axis in world metres (our floor is 100 x 60)
 *   yaw         extra Y rotation to align the hall's long axis with the line (X)
 *   yOffset     vertical nudge; slightly negative so our floor hides its floor
 *   cut         whether to apply the roof/upper-wall cutaway
 */
const CONFIG = {
  targetSpan: 120,
  yaw: 0,
  yOffset: -0.15,
  cut: true,
}

export function EnvironmentModel() {
  // draco off, meshopt on — the GLB is meshopt-compressed and drei bundles the
  // decoder locally, so there's no runtime CDN dependency.
  const { scene } = useGLTF(MODEL_URL, false, true)

  const { root, scale, offset } = useMemo(() => {
    const clone = scene.clone(true)
    clone.updateMatrixWorld(true)

    const box = new Box3().setFromObject(clone)
    const size = new Vector3()
    const center = new Vector3()
    box.getSize(size)
    box.getCenter(center)

    const longAxis = Math.max(size.x, size.z) || 1
    const s = CONFIG.targetSpan / longAxis
    const scaledHeight = size.y * s

    // Cut a bit below the roof but high enough to clear the machines.
    const plane = CONFIG.cut
      ? new Plane(new Vector3(0, -1, 0), Math.max(6, Math.min(11, scaledHeight * 0.5)))
      : null

    clone.traverse((o: Object3D) => {
      const m = o as Mesh
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return
      m.raycast = () => null // never steal taps meant for machines
      m.castShadow = false
      m.receiveShadow = true
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[]
      mats.forEach((mat) => {
        if (!mat) return
        if (plane) {
          mat.clippingPlanes = [plane]
          mat.clipShadows = true
        }
        mat.side = DoubleSide // cut walls read solid from the inside
      })
    })

    return {
      root: clone,
      scale: s,
      offset: [-center.x * s, -box.min.y * s + CONFIG.yOffset, -center.z * s      ] as [
        number,
        number,
        number,
      ],
    }
  }, [scene])

  return (
    <group rotation-y={CONFIG.yaw}>
      <group position={offset} scale={scale}>
        <primitive object={root} />
      </group>
    </group>
  )
}

useGLTF.preload(MODEL_URL, false, true)
