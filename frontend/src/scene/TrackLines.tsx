import { useEffect, useState } from 'react'
import { Line } from '@react-three/drei'
import { fetchTracks } from '../api'
import { useFactoryStore } from '../store'
import type { TrackDto } from '../types'
import { TAG_COLOR } from './LiveTags'

/**
 * Logistics "spaghetti chart": each movable tag's recent path over the selected
 * window, drawn as a coloured polyline just above the floor. Refreshes on a
 * timer while the layer is on, and follows the replay window length.
 */
export function TrackLines() {
  const show = useFactoryStore((s) => s.layers.tracks)
  const minutes = useFactoryStore((s) => s.replayMinutes)
  const [tracks, setTracks] = useState<TrackDto[]>([])

  useEffect(() => {
    if (!show) {
      setTracks([])
      return
    }
    let alive = true
    const load = () =>
      fetchTracks(minutes)
        .then((d) => alive && setTracks(d.tracks))
        .catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [show, minutes])

  if (!show) return null

  return (
    <group>
      {tracks.map((t) =>
        t.points.length >= 2 ? (
          <Line
            key={t.id}
            points={t.points.map(([x, z]) => [x, 0.25, z] as [number, number, number])}
            color={TAG_COLOR[t.kind]}
            lineWidth={1.6}
            transparent
            opacity={0.72}
          />
        ) : null,
      )}
    </group>
  )
}
