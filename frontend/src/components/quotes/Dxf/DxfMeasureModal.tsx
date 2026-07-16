import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, X, Ruler, Circle as CircleIcon, Triangle, CircleDot, MoveHorizontal, RotateCcw, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { DxfAnalysis, DxfPoint, DxfEntity } from '@/types'
import DxfCanvas, { type DxfCanvasHandle, type Pt, type ViewBox } from '@/components/quotes/Dxf/DxfCanvas'

interface Props {
  partFileId: number
  filename?: string
  onClose: () => void
}

type Tool = 'none' | 'distance' | 'diameter' | 'angle' | 'interasse' | 'linedist'
type Result = { kind: 'distance' | 'diameter' | 'angle' | 'interasse' | 'linedist'; value: number; at: DxfPoint; seg?: [DxfPoint, DxfPoint] } | null

const DISP = (x: number, y: number): DxfPoint => ({ x, y: -y })   // DXF (y-up) → display

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): number[][] {
  let s = a0, e = a1; if (e <= s) e += 360
  const n = Math.max(8, Math.ceil((e - s) / 5))
  const out: number[][] = []
  for (let k = 0; k <= n; k++) { const a = (s + (e - s) * (k / n)) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return out
}
function angleRelation(deg: number): string {
  if (deg < 1) return ' · parallele'
  if (Math.abs(deg - 90) < 1) return ' · perpendicolari'
  return ''
}

/** Viewer DXF con misure esatte sulle ENTITÀ vere, costruito sul viewport
 *  condiviso DxfCanvas. Strumenti: Distanza (snap ai punti) · Diametro · Angolo
 *  (due linee) · Interasse (due fori). */
export default function DxfMeasureModal({ partFileId, filename, onClose }: Props) {
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [tool, setTool] = useState<Tool>('none')
  const [unit, setUnit] = useState<'mm' | 'in'>('mm')
  const [picked, setPicked] = useState<DxfPoint[]>([])
  const [selEnt, setSelEnt] = useState<number[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [snapPreview, setSnapPreview] = useState<DxfPoint | null>(null)
  const [result, setResult] = useState<Result>(null)

  const canvasRef = useRef<DxfCanvasHandle | null>(null)
  const toolRef = useRef<Tool>('none'); toolRef.current = tool
  const hoveredRef = useRef<number | null>(null); hoveredRef.current = hovered

  useEffect(() => {
    setLoading(true)
    api.get<DxfAnalysis>(`/dxf/analyze-part-file/${partFileId}`)
      .then(r => setAnalysis(r.data))
      .catch(() => toast.error('Errore nel caricamento del DXF'))
      .finally(() => setLoading(false))
  }, [partFileId])

  // Default unità = quella dichiarata dall'header (pollici se il backend ha
  // convertito ×25.4). Se il file mente (dichiara pollici ma è in mm) l'utente
  // sceglie "mm" e le misure tornano ai valori reali.
  useEffect(() => { if (analysis) setUnit((analysis.unit_factor ?? 1) > 1.5 ? 'in' : 'mm') }, [analysis])

  const entities = useMemo<DxfEntity[]>(() => analysis?.entities ?? [], [analysis])
  const dispSnap = useMemo<DxfPoint[]>(() => (analysis?.snap_points ?? []).map(p => DISP(p.x, p.y)), [analysis])
  const entBbox = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const upd = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    for (const e of entities) {
      if (e.t === 'line') { upd(e.x1!, e.y1!); upd(e.x2!, e.y2!) }
      else if (e.t === 'circle' || e.t === 'arc') { upd(e.cx! - e.r!, e.cy! - e.r!); upd(e.cx! + e.r!, e.cy! + e.r!) }
      else if (e.pts) { for (const [x, y] of e.pts) upd(x, y) }
    }
    return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : (analysis?.bbox_global ?? null)
  }, [entities, analysis])

  // Fattore applicato dal backend (raw × factor = mm). L'override mm/pollici ha
  // senso solo per disegni mm/unitless (factor 1) o pollici (factor 25.4); per
  // unità metriche non-mm (cm/m) ci si fida del backend.
  const backendFactor = analysis?.unit_factor ?? 1
  const overridable = backendFactor === 1 || Math.abs(backendFactor - 25.4) < 0.05
  // displayed = raw × (unità scelta). raw = valore_convertito / backendFactor.
  const unitScale = overridable ? (unit === 'in' ? 25.4 : 1) / backendFactor : 1
  const fmt = (r: NonNullable<Result>): string => {
    const v = (r.value * unitScale).toFixed(2)
    return r.kind === 'diameter' ? `Ø ${v} mm`
      : r.kind === 'angle' ? `${r.value.toFixed(2)}°${angleRelation(r.value)}`
      : r.kind === 'interasse' ? `Interasse ${v} mm`
      : r.kind === 'linedist' ? `⊥ ${v} mm` : `${v} mm`
  }

  const clear = () => { setPicked([]); setSelEnt([]); setResult(null); setSnapPreview(null) }
  const switchTool = (t: Tool) => { setTool(cur => (cur === t ? 'none' : t)); clear() }

  const nearestSnap = (w: Pt, thr: number): DxfPoint | null => {
    let best: DxfPoint | null = null, bd = thr
    for (const p of dispSnap) { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < bd) { bd = d; best = p } }
    return best
  }

  const onPick = (w: Pt, pxpw: number) => {
    const t = toolRef.current
    if (t === 'none') return
    if (t === 'distance') {
      const p = nearestSnap(w, pxpw * 14) ?? w
      setPicked(prev => {
        const next = prev.length >= 2 ? [p] : [...prev, p]
        if (next.length === 2) setResult({ kind: 'distance', value: Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y), at: { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 } })
        else setResult(null)
        return next
      })
      return
    }
    const idx = hoveredRef.current
    if (idx == null || !entities[idx]) {
      toast.error(t === 'angle' ? 'Clicca due linee' : t === 'interasse' ? 'Clicca due fori/cerchi' : 'Clicca un cerchio/arco')
      return
    }
    const e = entities[idx]
    const isCirc = e.t === 'circle' || e.t === 'arc'
    if (t === 'diameter') {
      clear()
      if (!isCirc || e.r == null) { toast.error('Clicca su un cerchio o arco'); return }
      setSelEnt([idx]); setResult({ kind: 'diameter', value: e.r * 2, at: DISP(e.cx!, e.cy!) })
      return
    }
    if ((t === 'angle' || t === 'linedist') && e.t !== 'line') { toast.error('Clicca due linee'); return }
    if (t === 'interasse' && !isCirc) { toast.error('Clicca due fori/cerchi'); return }
    setSelEnt(prev => {
      if (prev.includes(idx)) return prev
      const next = prev.length >= 2 ? [idx] : [...prev, idx]
      if (next.length === 2) {
        const [a, b] = next.map(i => entities[i])
        if (t === 'angle') {
          const d1 = [a.x2! - a.x1!, a.y2! - a.y1!], d2 = [b.x2! - b.x1!, b.y2! - b.y1!]
          const dot = Math.abs(d1[0] * d2[0] + d1[1] * d2[1])
          const ang = Math.acos(Math.min(1, dot / (Math.hypot(...d1) * Math.hypot(...d2) || 1))) * 180 / Math.PI
          const m1 = DISP((a.x1! + a.x2!) / 2, (a.y1! + a.y2!) / 2), m2 = DISP((b.x1! + b.x2!) / 2, (b.y1! + b.y2!) / 2)
          setResult({ kind: 'angle', value: ang, at: { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 } })
        } else if (t === 'linedist') {
          // Distanza perpendicolare dal punto medio della linea A alla RETTA di B
          // (= offset reale se le due linee sono parallele).
          const P = { x: (a.x1! + a.x2!) / 2, y: (a.y1! + a.y2!) / 2 }
          const dx = b.x2! - b.x1!, dy = b.y2! - b.y1!, len = Math.hypot(dx, dy) || 1
          const nx = -dy / len, ny = dx / len
          const signed = (P.x - b.x1!) * nx + (P.y - b.y1!) * ny   // proiezione sulla normale
          const Q = { x: P.x - signed * nx, y: P.y - signed * ny }   // piede della perpendicolare su B
          const Pd = DISP(P.x, P.y), Qd = DISP(Q.x, Q.y)
          setResult({ kind: 'linedist', value: Math.abs(signed), at: { x: (Pd.x + Qd.x) / 2, y: (Pd.y + Qd.y) / 2 }, seg: [Pd, Qd] })
        } else {
          const val = Math.hypot(a.cx! - b.cx!, a.cy! - b.cy!)
          const m1 = DISP(a.cx!, a.cy!), m2 = DISP(b.cx!, b.cy!)
          setResult({ kind: 'interasse', value: val, at: { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 } })
        }
      } else setResult(null)
      return next
    })
  }

  const onHoverMove = (w: Pt, pxpw: number) => {
    if (toolRef.current === 'distance') setSnapPreview(nearestSnap(w, pxpw * 14))
    else if (snapPreview) setSnapPreview(null)
  }

  // ─── contenuto (entità) ──────────────────────────────────────────────────
  const strokeOf = (i: number) => selEnt.includes(i) ? '#2563eb' : i === hovered ? '#60a5fa' : '#475569'
  const widthOf = (i: number) => selEnt.includes(i) ? 2.4 : i === hovered ? 2 : 1.2
  const renderEntity = (e: DxfEntity, i: number) => {
    const stroke = strokeOf(i), sw = widthOf(i)
    const common = { fill: 'none' as const, stroke, strokeWidth: sw, vectorEffect: 'non-scaling-stroke' as const, style: { pointerEvents: 'none' as const } }
    const ghost = { fill: 'none' as const, stroke: 'transparent', strokeWidth: 10, vectorEffect: 'non-scaling-stroke' as const, style: { pointerEvents: 'stroke' as const, cursor: 'pointer' as const }, onPointerEnter: () => setHovered(i), onPointerLeave: () => setHovered(cur => (cur === i ? null : cur)) }
    if (e.t === 'line') { const p = { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }; return <g key={i}><line {...p} {...ghost} /><line {...p} {...common} /></g> }
    if (e.t === 'circle') { const p = { cx: e.cx, cy: e.cy, r: e.r }; return <g key={i}><circle {...p} {...ghost} /><circle {...p} {...common} /></g> }
    const pts = (e.t === 'arc' ? arcPoints(e.cx!, e.cy!, e.r!, e.a0!, e.a1!) : (e.pts ?? [])).map(([x, y]) => `${x},${y}`).join(' ')
    return <g key={i}><polyline points={pts} {...ghost} /><polyline points={pts} {...common} /></g>
  }

  // ─── overlay (misure, in display) ────────────────────────────────────────
  const overlay = (view: ViewBox) => {
    const markerR = view.w * 0.006
    const pill = result && (() => {
      const text = fmt(result), fs = view.w * 0.026, w = text.length * fs * 0.62 + fs * 1.1, h = fs * 1.7, { x, y } = result.at
      return (
        <g>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill="rgba(233,240,254,0.96)" stroke="rgba(37,99,235,0.35)" strokeWidth={view.w * 0.0016} />
          <text x={x} y={y} fontSize={fs} fill="#2563eb" fontFamily="ui-monospace, monospace" fontWeight={600} textAnchor="middle" dominantBaseline="central">{text}</text>
        </g>
      )
    })()
    return (
      <>
        {picked.length === 2 && <line x1={picked[0].x} y1={picked[0].y} x2={picked[1].x} y2={picked[1].y} stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        {picked.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={markerR} fill="#2563eb" />)}
        {result?.seg && (
          <>
            <line x1={result.seg[0].x} y1={result.seg[0].y} x2={result.seg[1].x} y2={result.seg[1].y} stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <circle cx={result.seg[0].x} cy={result.seg[0].y} r={markerR} fill="#2563eb" />
            <circle cx={result.seg[1].x} cy={result.seg[1].y} r={markerR} fill="#2563eb" />
          </>
        )}
        {snapPreview && <circle cx={snapPreview.x} cy={snapPreview.y} r={markerR * 1.6} fill="none" stroke="#ea580c" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {pill}
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 p-4">
      <div className="flex h-[92vh] w-full max-w-[1400px] flex-col rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <FileText className="h-4 w-4" /> {filename || 'Disegno DXF'} <span className="text-[11px] font-normal text-muted-foreground">· misure esatte</span>
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2">
          <Button size="sm" variant={tool === 'distance' ? 'default' : 'outline'} onClick={() => switchTool('distance')} disabled={loading || !analysis}><Ruler className="mr-1 h-3.5 w-3.5" /> Distanza</Button>
          <Button size="sm" variant={tool === 'diameter' ? 'default' : 'outline'} onClick={() => switchTool('diameter')} disabled={loading || !analysis}><CircleIcon className="mr-1 h-3.5 w-3.5" /> Diametro</Button>
          <Button size="sm" variant={tool === 'angle' ? 'default' : 'outline'} onClick={() => switchTool('angle')} disabled={loading || !analysis}><Triangle className="mr-1 h-3.5 w-3.5" /> Angolo</Button>
          <Button size="sm" variant={tool === 'interasse' ? 'default' : 'outline'} onClick={() => switchTool('interasse')} disabled={loading || !analysis}><CircleDot className="mr-1 h-3.5 w-3.5" /> Interasse</Button>
          <Button size="sm" variant={tool === 'linedist' ? 'default' : 'outline'} onClick={() => switchTool('linedist')} disabled={loading || !analysis}><MoveHorizontal className="mr-1 h-3.5 w-3.5" /> Quota linee</Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={loading || !analysis}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Azzera</Button>
          <Button size="sm" variant="outline" onClick={() => canvasRef.current?.fit()} disabled={loading || !analysis} title="Adatta alla vista"><Maximize className="mr-1 h-3.5 w-3.5" /> Adatta</Button>
          {overridable && (
            <div className="ml-1 flex items-center gap-1 text-[12px] text-muted-foreground">
              <span>Disegno in:</span>
              <div className="flex overflow-hidden rounded-md border border-border">
                {(['mm', 'in'] as const).map(u => (
                  <button key={u} type="button" onClick={() => setUnit(u)} className={`px-2 py-0.5 text-[12px] font-medium ${unit === u ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{u === 'mm' ? 'mm' : 'pollici'}</button>
                ))}
              </div>
            </div>
          )}
          {result && <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 font-mono text-[13px] font-semibold text-primary">{fmt(result)}</span>}
        </div>

        {analysis && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-2 text-[12.5px]">
            <span className="text-muted-foreground">Dimensioni: <span className="font-mono font-semibold text-foreground">{(analysis.bbox_global.w * unitScale).toFixed(2)} × {(analysis.bbox_global.h * unitScale).toFixed(2)}</span> mm</span>
            <span className="text-muted-foreground">Entità: <span className="font-mono font-semibold text-foreground">{entities.length}</span></span>
            <span className="text-muted-foreground">Profili: <span className="font-mono font-semibold text-foreground">{analysis.profiles.length}</span> ({analysis.n_closed_profiles} chiusi)</span>
            <span className="text-muted-foreground">Sviluppo: <span className="font-mono font-semibold text-foreground">{(analysis.total_length_mm * unitScale).toFixed(2)}</span> mm</span>
            <span className="text-[12px] text-muted-foreground/70">
              {tool === 'distance' ? 'Clicca due punti (snap agli estremi/centri).' : tool === 'diameter' ? 'Clicca un cerchio/arco.' : tool === 'angle' ? 'Clicca due linee.' : tool === 'interasse' ? 'Clicca due fori/cerchi.' : tool === 'linedist' ? 'Clicca due linee → distanza perpendicolare (offset parallele).' : 'Trascina · rotella zoom · passa sopra le entità.'}
            </span>
          </div>
        )}

        <div className="relative flex-1 overflow-hidden bg-white" style={{ minHeight: 420 }}>
          {analysis && (
            <DxfCanvas ref={canvasRef} bbox={entBbox} content={entities.map(renderEntity)} overlay={overlay}
              onPick={onPick} onHoverMove={onHoverMove}
              cursor={tool === 'none' ? 'grab' : 'crosshair'} />
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
