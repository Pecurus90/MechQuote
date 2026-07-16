import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'

export interface Pt { x: number; y: number }
export interface ViewBox { x: number; y: number; w: number; h: number }
export interface Bbox { x: number; y: number; w: number; h: number }
export interface DxfCanvasHandle { fit: () => void }

interface Props {
  /** Bbox del disegno in coord DXF (y-up). Usato per l'inquadratura iniziale. */
  bbox: Bbox | null
  /** Contenuto nel gruppo flippato (coord DXF): entità o profili SVG. */
  content: ReactNode
  /** Overlay in coord display (già y-giù): marker/quote/selezione. Riceve la
   *  view corrente per dimensionare le etichette in modo costante a schermo. */
  overlay?: (view: ViewBox) => ReactNode
  /** Clic FERMO (non trascinamento): world in coord display + world-per-pixel. */
  onPick?: (world: Pt, pxPerWorld: number) => void
  /** Movimento del puntatore senza trascinamento (per preview snap ecc.). */
  onHoverMove?: (world: Pt, pxPerWorld: number) => void
  cursor?: string
}

/**
 * Viewport DXF interattivo CONDIVISO: rendering (contenuto in coord DXF flippate
 * a display), zoom (rotella), pan (trascina), conversioni schermo↔mondo. È
 * agnostico al contenuto: il viewer misura ci mette le entità + gli strumenti;
 * il picker profili ci mette i profili + la selezione. Gemello 2D del viewport
 * del viewer STEP.
 *
 * Spazio "display": dispY = -y (DXF ha Y verso l'alto, il DOM verso il basso).
 * Il contenuto sta in un gruppo `scale(1,-1)` (coord DXF); l'overlay è già in
 * display → niente testo capovolto.
 */
const DxfCanvas = forwardRef<DxfCanvasHandle, Props>(function DxfCanvas(
  { bbox, content, overlay, onPick, onHoverMove, cursor = 'grab' }, ref,
) {
  const [view, setView] = useState<ViewBox | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewRef = useRef<ViewBox | null>(null); viewRef.current = view
  const drag = useRef({ active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 })

  const fit = () => {
    if (!bbox || (bbox.w === 0 && bbox.h === 0)) { setView({ x: -10, y: -10, w: 20, h: 20 }); return }
    const pad = Math.max(bbox.w, bbox.h, 1) * 0.08
    setView({ x: bbox.x - pad, y: -(bbox.y + bbox.h) - pad, w: bbox.w + 2 * pad, h: bbox.h + 2 * pad })
  }
  useImperativeHandle(ref, () => ({ fit }))
  // Re-inquadra quando cambia il disegno.
  useEffect(() => { fit() /* eslint-disable-next-line */ }, [bbox])

  const worldFromClient = (cx: number, cy: number): Pt | null => {
    const svg = svgRef.current; if (!svg) return null
    const ctm = svg.getScreenCTM(); if (!ctm) return null
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }
  const worldPerPx = (cx: number, cy: number): number => {
    const a = worldFromClient(cx, cy), b = worldFromClient(cx + 1, cy)
    return (a && b) ? Math.hypot(b.x - a.x, b.y - a.y) : 1
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (d.active) {
      const cur = worldFromClient(e.clientX, e.clientY), prev = worldFromClient(d.lastX, d.lastY)
      if (cur && prev) setView(v => (v ? { ...v, x: v.x - (cur.x - prev.x), y: v.y - (cur.y - prev.y) } : v))
      d.lastX = e.clientX; d.lastY = e.clientY
      return
    }
    if (onHoverMove) {
      const w = worldFromClient(e.clientX, e.clientY)
      if (w) onHoverMove(w, worldPerPx(e.clientX, e.clientY))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; d.active = false
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) return   // era pan
    const w = worldFromClient(e.clientX, e.clientY)
    if (w && onPick) onPick(w, worldPerPx(e.clientX, e.clientY))
  }

  // Wheel nativo (passive:false) per non far scrollare la pagina.
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current; if (!v) return
      e.preventDefault()
      const c = worldFromClient(e.clientX, e.clientY); if (!c) return
      const f = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const nw = v.w * f, nh = v.h * f
      setView({ x: c.x - ((c.x - v.x) / v.w) * nw, y: c.y - ((c.y - v.y) / v.h) * nh, w: nw, h: nh })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  if (!view) return null
  return (
    <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: 'none', cursor, background: 'rgba(148,163,184,0.04)' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <g transform="scale(1,-1)">{content}</g>
      <g>{overlay?.(view)}</g>
    </svg>
  )
})

export default DxfCanvas
