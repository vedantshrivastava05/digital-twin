import { useFactoryStore } from '../store'

const WINDOWS = [5, 15, 30]
const SPEEDS = [1, 4, 16]

/**
 * Time-travel bar: toggle Live vs Replay, scrub through recorded tag movement,
 * play/pause, pick playback speed, and choose the history window. In replay the
 * scene renders tag positions from the recorded frames instead of the live feed.
 */
export function Timeline() {
  const replayMode = useFactoryStore((s) => s.replayMode)
  const frames = useFactoryStore((s) => s.frames)
  const frameIndex = useFactoryStore((s) => s.frameIndex)
  const playing = useFactoryStore((s) => s.playing)
  const speed = useFactoryStore((s) => s.replaySpeed)
  const minutes = useFactoryStore((s) => s.replayMinutes)
  const enterReplay = useFactoryStore((s) => s.enterReplay)
  const exitReplay = useFactoryStore((s) => s.exitReplay)
  const setFrameIndex = useFactoryStore((s) => s.setFrameIndex)
  const setPlaying = useFactoryStore((s) => s.setPlaying)
  const setReplaySpeed = useFactoryStore((s) => s.setReplaySpeed)

  const current = frames && frames[frameIndex]
  const stamp = current ? new Date(current.ts).toLocaleTimeString() : '—'
  const count = frames?.length ?? 0

  return (
    <div className="timeline">
      <div className="timeline-mode">
        <button
          className={`chip${!replayMode ? ' active' : ''}`}
          onClick={() => exitReplay()}
        >
          <span className={`live-dot${!replayMode ? ' on' : ''}`} /> Live
        </button>
        <button
          className={`chip${replayMode ? ' active' : ''}`}
          onClick={() => enterReplay()}
        >
          Replay
        </button>
      </div>

      {replayMode ? (
        <>
          <button
            className="chip play"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            className="timeline-scrub"
            type="range"
            min={0}
            max={Math.max(0, count - 1)}
            value={frameIndex}
            onChange={(e) => {
              setPlaying(false)
              setFrameIndex(Number(e.target.value))
            }}
          />
          <span className="timeline-stamp">{stamp}</span>
          <div className="timeline-speeds">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`chip mini${speed === s ? ' active' : ''}`}
                onClick={() => setReplaySpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </>
      ) : (
        <span className="timeline-hint">Movement history · logistics replay</span>
      )}

      <div className="timeline-windows">
        {WINDOWS.map((m) => (
          <button
            key={m}
            className={`chip mini${minutes === m ? ' active' : ''}`}
            onClick={() => {
              if (replayMode) enterReplay(m)
              else useFactoryStore.setState({ replayMinutes: m })
            }}
          >
            {m}m
          </button>
        ))}
      </div>
    </div>
  )
}
