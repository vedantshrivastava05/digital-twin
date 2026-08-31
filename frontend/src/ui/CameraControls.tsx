import { useFactoryStore } from '../store'
import { IndustrialIcon, type IndustrialIconName } from './IndustrialIcon'

const PRESETS: { key: 'top' | 'front' | 'isometric'; label: string; icon: IndustrialIconName }[] = [
  { key: 'top', label: 'Top view', icon: 'top' },
  { key: 'front', label: 'Front view', icon: 'front' },
  { key: 'isometric', label: 'Isometric', icon: 'cube' },
]

interface CameraControlsProps {
  layoutMapOpen: boolean
  onToggleLayoutMap: () => void
}

export function CameraControls({ layoutMapOpen, onToggleLayoutMap }: CameraControlsProps) {
  const requestCameraPreset = useFactoryStore((s) => s.requestCameraPreset)
  const cameraRequest = useFactoryStore((s) => s.cameraRequest)
  const walkMode = useFactoryStore((s) => s.walkMode)
  const setWalkMode = useFactoryStore((s) => s.setWalkMode)
  const editMode = useFactoryStore((s) => s.editMode)

  const usePreset = (preset: 'top' | 'front' | 'isometric' | 'reset') => {
    if (walkMode) setWalkMode(false)
    requestCameraPreset(preset)
  }

  return (
    <nav className="industrial-camera-controls" aria-label="Camera controls">
      <span className="industrial-camera-label">Camera</span>
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          className={!walkMode && cameraRequest.preset === preset.key ? 'active' : ''}
          onClick={() => usePreset(preset.key)}
          title={preset.label}
        >
          <IndustrialIcon name={preset.icon} size={17} />
          <span>{preset.label}</span>
        </button>
      ))}
      <span className="industrial-camera-separator" />
      <button
        className={walkMode ? 'active' : ''}
        onClick={() => setWalkMode(!walkMode)}
        disabled={editMode}
        title={editMode ? 'Exit Edit Layout mode to enter walkthrough' : 'First-person walkthrough (WASD)'}
      >
        <IndustrialIcon name="walk" size={17} />
        <span>First person</span>
      </button>
      <button onClick={() => usePreset('reset')} title="Reset camera">
        <IndustrialIcon name="reset" size={17} />
        <span>Reset</span>
      </button>
      <span className="industrial-camera-separator" />
      <button
        className={layoutMapOpen ? 'active' : ''}
        onClick={onToggleLayoutMap}
        aria-label={`${layoutMapOpen ? 'Hide' : 'Show'} layout map`}
        aria-controls="factory-layout-map"
        aria-expanded={layoutMapOpen}
        aria-pressed={layoutMapOpen}
        title={`${layoutMapOpen ? 'Hide' : 'Show'} layout map`}
      >
        <IndustrialIcon name="grid" size={17} />
        <span>Layout map</span>
      </button>
    </nav>
  )
}
