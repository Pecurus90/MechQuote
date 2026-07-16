import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, X, Ruler, Circle as CircleIcon, RotateCcw, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { DxfAnalysis, DxfPoint, DxfCircle } from '@/types'

interface Props {
  partFileId: number
  filename?: string
  onClose: () => void
}

type Tool = 'none' | 'distance' | 'diameter'
interface ViewBox { x: number; y: number; w: number; h: number }

/**
 * Viewer DXF interattivo con misure ESATTE (gemello 2D del viewer STEP).
 * Il backend (ezdxf) fornisce i profili come path SVG + le primitive di misura
 * (snap_points, circles). Qui: zoom/pan, Distanza (snap ai punti veri) e
 * Diametro (sui cerchi/archi), con quote a pillola nel disegno.
 *
 * Lavoriamo in spazio "display" (dispY = -y): il DXF ha Y verso l'alto, il DOM
 * verso il basso. Solo i profili (path in coordinate DXF) stanno in un gruppo
 * `scale(1,-1)`; l'overlay è già in display → niente testo capovolto.
 */
export default function DxfMeasureModal({ partFileId, filename, onClose }: Props) {
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [tool, setTool] = useState<Tool>('none')
  const [view, setView] = useState<ViewBox | null>(null)
  const [picked, setPicked] = useState<DxfPoint[]>([])            // display coords
  const [hiCircle, setHiCircle] = useState<DxfCircle | null>(null) // display coords
  const [result, setResult] = useState<{ kind: 'distance' | 'diameter'; value: number; at: DxfPoint } | null>(null)
  // Override unità: alcuni CAD scrivono "mm" ma le coordinate sono in pollici.
  // 'in' → i valori misurati vengono moltiplicati ×25.4 per ottenere i mm reali.
  const [unit, setUnit] = useState<'mm' | 'in'>('mm')
  const unitScale = unit === 'in' ? 25.4 : 1
  const fmt = (r: { kind: 'distance' | 'diameter'; value: number }) => {
    const v = (r.value * unitScale).toFixed(2)
    return r.kind === 'diameter' ? `Ø ${v} mm` : `${v} mm`
  }

  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewRef = useRef<ViewBox | null>(null)
  viewRef.current = view
  const toolRef = useRef<Tool>('none'); toolRef.current = tool
  const drag = useRef({ active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 })

  useEffect(() => {
    setLoading(true)
    api.get<DxfAnalysis>(`/dxf/analyze-part-file/${partFileId}`)
      .then(r => setAnalysis(r.data))
      .catch(() => toast.error('Errore nel caricamento del DXF'))
      .finally(() => setLoading(false))
  }, [partFileId])

  const dispSnap = useMemo<DxfPoint[]>(
    () => (analysis?.snap_points ?? []).map(p => ({ x: p.x, y: -p.y })), [analysis])
  const dispCircles = useMemo<DxfCircle[]>(
    () => (analysis?.circles ?? []).map(c => ({ x: c.x, y: -c.y, r: c.r, full: c.full })), [analysis])

  const fitView = () => {
    if (!analysis) return
    const b = analysis.bbox_global
    const pad = Math.max(b.w, b.h, 1) * 0.08
    setView({ x: b.x - pad, y: -(b.y + b.h) - pad, w: b.w + 2 * pad, h: b.h + 2 * pad })
  }
  useEffect(() => { fitView() /* eslint-disable-next-line */ }, [analysis])

  const clear = () => { setPicked([]); setResult(null); setHiCircle(null) }
  const switchTool = (t: Tool) => { setTool(cur => (cur === t ? 'none' : t)); clear() }

  // ─── conversioni schermo ↔ mondo (display) ─────────────────────────────────
  const worldFromClient = (cx: number, cy: number): DxfPoint | null => {
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
  const snap = (w: DxfPoint, thr: number): DxfPoint => {
    let best = w, bd = thr
    for (const p of dispSnap) { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < bd) { bd = d; best = p } }
    return best
  }
  const nearestCircle = (w: DxfPoint, thr: number): DxfCircle | null => {
    let best: DxfCircle | null = null, bd = thr
    for (const c of dispCircles) {
      const d = Math.abs(Math.hypot(c.x - w.x, c.y - w.y) - c.r)   // distanza dall'anello
      if (d < bd) { bd = d; best = c }
    }
    return best
  }

  const measureAt = (cx: number, cy: number) => {
    const t = toolRef.current
    if (t === 'none') return
    const w = worldFromClient(cx, cy); if (!w) return
    const thr = worldPerPx(cx, cy) * 14
    if (t === 'diameter') {
      clear()
      const c = nearestCircle(w, thr)
      if (!c) { toast.error('Avvicinati a un cerchio o arco'); return }
      setHiCircle(c)
      setResult({ kind: 'diameter', value: c.r * 2, at: { x: c.x, y: c.y } })
      return
    }
    // distanza
    const p = snap(w, thr)
    setPicked(prev => {
      const next = prev.length >= 2 ? [p] : [...prev, p]
      if (next.length === 2) {
        const val = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y)
        setResult({ kind: 'distance', value: val, at: { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 } })
      } else setResult(null)
      return next
    })
  }

  // ─── interazione: pan (drag), zoom (wheel), misura (clic fermo) ─────────────
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.active) return
    const cur = worldFromClient(e.clientX, e.clientY)
    const prev = worldFromClient(d.lastX, d.lastY)
    if (cur && prev) setView(v => (v ? { ...v, x: v.x - (cur.x - prev.x), y: v.y - (cur.y - prev.y) } : v))
    d.lastX = e.clientX; d.lastY = e.clientY
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; d.active = false
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) return   // era pan
    measureAt(e.clientX, e.clientY)                                          // clic fermo → misura
  }

  // Wheel nativo con passive:false (altrimenti il browser scrolla la pagina).
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current; if (!v) return
      e.preventDefault()
      const c = worldFromClient(e.clientX, e.clientY); if (!c) return
      const f = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const nw = v.w * f, nh = v.h * f
      const fx = (c.x - v.x) / v.w, fy = (c.y - v.y) / v.h
      setView({ x: c.x - fx * nw, y: c.y - fy * nh, w: nw, h: nh })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [analysis])

  // ─── render ────────────────────────────────────────────────────────────────
  const markerR = view ? view.w * 0.006 : 1
  const pill = (() => {
    if (!result || !view) return null
    const text = fmt(result)
    const fs = view.w * 0.026
    const w = text.length * fs * 0.62 + fs * 1.1
    const h = fs * 1.7
    const { x, y } = result.at
    return (
      <g>
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2}
          fill="rgba(233,240,254,0.96)" stroke="rgba(37,99,235,0.35)" strokeWidth={view.w * 0.0016} />
        <text x={x} y={y} fontSize={fs} fill="#2563eb" fontFamily="ui-monospace, monospace"
          fontWeight={600} textAnchor="middle" dominantBaseline="central">{text}</text>
      </g>
    )
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 p-4">
      <div className="flex h-[92vh] w-full max-w-[1400px] flex-col rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <FileText className="h-4 w-4" /> {filename || 'Disegno DXF'} <span className="text-[11px] font-normal text-muted-foreground">· misure esatte</span>
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-5 py-2">
          <Button size="sm" variant={tool === 'distance' ? 'default' : 'outline'} onClick={() => switchTool('distance')} disabled={loading || !analysis}>
            <Ruler className="mr-1 h-3.5 w-3.5" /> Distanza
          </Button>
          <Button size="sm" variant={tool === 'diameter' ? 'default' : 'outline'} onClick={() => switchTool('diameter')} disabled={loading || !analysis}>
            <CircleIcon className="mr-1 h-3.5 w-3.5" /> Diametro
          </Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={loading || !analysis}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Azzera
          </Button>
          <Button size="sm" variant="outline" onClick={fitView} disabled={loading || !analysis} title="Adatta alla vista">
            <Maximize className="mr-1 h-3.5 w-3.5" /> Adatta
          </Button>
          <div className="ml-1 flex items-center gap-1 text-[12px] text-muted-foreground">
            <span>Disegno in:</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              {(['mm', 'in'] as const).map(u => (
                <button key={u} type="button" onClick={() => setUnit(u)}
                  className={`px-2 py-0.5 text-[12px] font-medium ${unit === u ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>
                  {u === 'mm' ? 'mm' : 'pollici'}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[12.5px] text-muted-foreground">
            {tool === 'distance' ? 'Clicca due punti (aggancia a estremi/centri) → distanza.'
              : tool === 'diameter' ? 'Clicca su un cerchio o arco → diametro esatto.'
              : 'Trascina per spostare · rotella per zoom.'}
          </span>
          {result && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 font-mono text-[13px] font-semibold text-primary">{fmt(result)}</span>
          )}
        </div>

        {analysis && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-2 text-[12.5px]">
            <span className="text-muted-foreground">Dimensioni: <span className="font-mono font-semibold text-foreground">{(analysis.bbox_global.w * unitScale).toFixed(2)} × {(analysis.bbox_global.h * unitScale).toFixed(2)}</span> mm</span>
            <span className="text-muted-foreground">Profili: <span className="font-mono font-semibold text-foreground">{analysis.profiles.length}</span> ({analysis.n_closed_profiles} chiusi)</span>
            <span className="text-muted-foreground">Sviluppo totale: <span className="font-mono font-semibold text-foreground">{(analysis.total_length_mm * unitScale).toFixed(2)}</span> mm</span>
          </div>
        )}

        <div className="relative flex-1 overflow-hidden bg-white" style={{ minHeight: 420 }}>
          {view && analysis && (
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 h-full w-full"
              style={{ touchAction: 'none', cursor: tool === 'none' ? 'grab' : 'crosshair', background: 'rgba(148,163,184,0.04)' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Profili: DXF (y-up) → display via scale(1,-1) */}
              <g transform="scale(1,-1)">
                {analysis.profiles.map(p => (
                  <path key={p.id} d={p.svg_path} fill="none"
                    stroke={p.closed ? '#334155' : '#94a3b8'} strokeWidth={1.2}
                    strokeDasharray={p.closed ? undefined : '4 3'} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              {/* Overlay misure (già in display) */}
              <g>
                {hiCircle && (
                  <circle cx={hiCircle.x} cy={hiCircle.y} r={hiCircle.r} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                )}
                {picked.length === 2 && (
                  <line x1={picked[0].x} y1={picked[0].y} x2={picked[1].x} y2={picked[1].y} stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                {picked.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={markerR} fill="#2563eb" />
                ))}
                {pill}
              </g>
            </svg>
          )}
          {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-primary"><span className="animate-pulse">Caricamento DXF…</span></div>}
          {!loading && !analysis && <div className="absolute inset-0 flex items-center justify-center text-sm text-danger">DXF non leggibile</div>}
        </div>

        <div className="flex justify-end border-t border-border bg-muted px-5 py-3">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    </div>
  )
}
