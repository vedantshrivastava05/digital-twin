import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Procedural, dependency-free textures generated on a 2D canvas at runtime.
 * Kept here (and memoized as module singletons) so the factory shell can look
 * like real polished concrete / corrugated metal without shipping any image
 * assets or requiring network access.
 */

function canvas(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c.getContext('2d') as CanvasRenderingContext2D
}

let concrete: Texture | null = null
/** Light polished-concrete slab: subtle speckle + faint expansion-joint grid. */
export function concreteTexture(): Texture {
  if (concrete) return concrete
  const size = 512
  const ctx = canvas(size, size)
  ctx.fillStyle = '#c9ced5'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 11000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = Math.random() * 2.2
    ctx.fillStyle =
      Math.random() > 0.5
        ? `rgba(255,255,255,${Math.random() * 0.05})`
        : `rgba(64,74,90,${Math.random() * 0.08})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(88,96,108,0.4)'
  ctx.lineWidth = 2
  const cells = 4
  const step = size / cells
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * step)
    ctx.lineTo(size, i * step)
    ctx.stroke()
  }
  const tex = new CanvasTexture(ctx.canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(10, 6)
  tex.colorSpace = SRGBColorSpace
  concrete = tex
  return tex
}

let metal: Texture | null = null
/** Corrugated sheet-metal cladding: vertical light/shadow ribs. */
export function metalRibTexture(): Texture {
  if (metal) return metal
  const w = 512
  const h = 4
  const ctx = canvas(w, h)
  const ribs = 40
  for (let x = 0; x < w; x++) {
    const t = (Math.sin((x / w) * Math.PI * 2 * ribs) + 1) / 2
    const v = Math.round(198 + t * 42)
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`
    ctx.fillRect(x, 0, 1, h)
  }
  const tex = new CanvasTexture(ctx.canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  metal = tex
  return tex
}
