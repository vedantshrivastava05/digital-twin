import { Html } from '@react-three/drei'
import { useFactoryStore } from '../store'

/** Annotation pins in the 3D scene plus the pending (not yet saved) pin */
export function Pins() {
  const annotations = useFactoryStore((s) => s.annotations)
  const pendingPin = useFactoryStore((s) => s.pendingPin)
  const selectedAnnotationId = useFactoryStore((s) => s.selectedAnnotationId)
  const selectAnnotation = useFactoryStore((s) => s.selectAnnotation)
  const removeAnnotation = useFactoryStore((s) => s.removeAnnotation)

  return (
    <group>
      {annotations.map((ann) => (
        <group key={ann.id} position={[ann.x, ann.y, ann.z]}>
          <mesh position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.5, 6]} />
            <meshStandardMaterial color="#7c6a2b" />
          </mesh>
          <mesh
            position={[0, 1.55, 0]}
            onClick={(e) => {
              e.stopPropagation()
              selectAnnotation(selectedAnnotationId === ann.id ? null : ann.id)
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = 'auto')}
          >
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive="#f59e0b"
              emissiveIntensity={selectedAnnotationId === ann.id ? 1.6 : 0.6}
            />
          </mesh>
          {selectedAnnotationId === ann.id && (
            <Html position={[0, 2.1, 0]} center distanceFactor={18}>
              <div className="pin-popup">
                <p>{ann.text}</p>
                <div className="pin-meta">
                  <span>{ann.author}</span>
                  <button onClick={() => removeAnnotation(ann.id)}>Delete</button>
                </div>
              </div>
            </Html>
          )}
        </group>
      ))}
      {pendingPin && (
        <group position={[pendingPin.x, pendingPin.y, pendingPin.z]}>
          <mesh position={[0, 1.55, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.5, 6]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
        </group>
      )}
    </group>
  )
}
