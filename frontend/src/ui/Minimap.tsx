import { STATUS_COLORS } from '../constants'
import { categoryOf, useFactoryStore } from '../store'
import { CAMPUS, campusExtent } from '../scene/campusLayout'

const EXT = campusExtent(20)

/** Top-down floorplan: machines as status-colored marks, click to select */
export function Minimap() {
  const twin = useFactoryStore((s) => s.twin)
  const machines = useFactoryStore((s) => s.machines)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const select = useFactoryStore((s) => s.select)

  if (!twin) return null

  return (
    <svg
      id="factory-layout-map"
      className="minimap"
      role="img"
      aria-label="Factory machine layout map"
      viewBox={`${EXT.minX} ${EXT.minZ} ${EXT.w} ${EXT.d}`}
    >
      <rect
        x={EXT.minX}
        y={EXT.minZ}
        width={EXT.w}
        height={EXT.d}
        rx={2}
        fill="rgba(13,17,25,0.85)"
        stroke="rgba(148,163,184,0.35)"
        strokeWidth={0.6}
      />
      {CAMPUS.map((b) => (
        <rect
          key={b.id}
          x={b.x - b.halfX}
          y={b.z - b.halfD}
          width={b.halfX * 2}
          height={b.halfD * 2}
          rx={1}
          fill="rgba(56,189,248,0.06)"
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={0.8}
        />
      ))}
      {twin.instances.map((inst) => {
        const status = machines[inst.id]?.status ?? 'idle'
        const category = categoryOf(twin, inst)
        const isSelected = selectedId === inst.id
        if (category === 'bodyline' || category === 'trimline') {
          const asset = twin.assets.find((a) => a.id === inst.asset_id)
          const w = asset?.footprint_w ?? 40
          return (
            <rect
              key={inst.id}
              x={inst.x - w / 2}
              y={inst.z - 1.6}
              width={w}
              height={3.2}
              rx={1}
              fill={STATUS_COLORS[status]}
              opacity={isSelected ? 1 : 0.55}
              stroke={isSelected ? '#38bdf8' : 'none'}
              strokeWidth={0.8}
              onClick={() => select(inst.id)}
              style={{ cursor: 'pointer' }}
            />
          )
        }
        return (
          <circle
            key={inst.id}
            cx={inst.x}
            cy={inst.z}
            r={isSelected ? 1.9 : 1.4}
            fill={STATUS_COLORS[status]}
            stroke={isSelected ? '#38bdf8' : 'rgba(255,255,255,0.4)'}
            strokeWidth={isSelected ? 0.8 : 0.25}
            onClick={() => select(inst.id)}
            style={{ cursor: 'pointer' }}
          />
        )
      })}
    </svg>
  )
}
