interface CarBodyProps {
  color?: string
  /** Finished cars on the trim line get wheels; body-in-white shells ride skids */
  wheels?: boolean
}

/**
 * Stylized car body, ~3.8 long x 1.7 wide, origin at the underbody.
 */
export function CarBody({ color = '#b9c0c9', wheels = false }: CarBodyProps) {
  const paint = (
    <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
  )
  const glass = <meshStandardMaterial color="#151b24" roughness={0.2} metalness={0.1} />

  return (
    <group position={[0, wheels ? 0.18 : 0, 0]}>
      {/* Lower body */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[3.8, 0.52, 1.7]} />
        {paint}
      </mesh>
      {/* Hood (sloping to the nose) */}
      <mesh position={[1.25, 0.66, 0]} rotation-z={-0.09} castShadow>
        <boxGeometry args={[1.3, 0.12, 1.6]} />
        {paint}
      </mesh>
      {/* Trunk deck */}
      <mesh position={[-1.4, 0.68, 0]} castShadow>
        <boxGeometry args={[1.0, 0.14, 1.6]} />
        {paint}
      </mesh>
      {/* Cabin glasshouse (dark) */}
      <mesh position={[-0.15, 0.92, 0]}>
        <boxGeometry args={[1.7, 0.52, 1.42]} />
        {glass}
      </mesh>
      {/* Windshield */}
      <mesh position={[0.78, 0.9, 0]} rotation-z={0.62}>
        <boxGeometry args={[0.62, 0.06, 1.44]} />
        {glass}
      </mesh>
      {/* Rear glass */}
      <mesh position={[-1.05, 0.9, 0]} rotation-z={-0.55}>
        <boxGeometry args={[0.5, 0.06, 1.44]} />
        {glass}
      </mesh>
      {/* Roof */}
      <mesh position={[-0.15, 1.2, 0]} castShadow>
        <boxGeometry args={[1.55, 0.09, 1.5]} />
        {paint}
      </mesh>
      {/* A/B pillars hint */}
      <mesh position={[0.55, 1.02, 0]}>
        <boxGeometry args={[0.08, 0.4, 1.48]} />
        {paint}
      </mesh>
      {wheels &&
        [1.25, -1.25].flatMap((x) =>
          [0.78, -0.78].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.05, z]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.3, 0.3, 0.24, 16]} />
              <meshStandardMaterial color="#14181f" roughness={0.9} />
            </mesh>
          )),
        )}
    </group>
  )
}
