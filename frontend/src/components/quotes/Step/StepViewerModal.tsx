import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import occtimportjs from 'occt-import-js'
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'
import { Box, X, Ruler, RotateCcw, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { toast } from 'sonner'

export interface StepGeometry {
  x: number; y: number; z: number   // ingombro (bounding box) in mm
  volumeCm3: number
  weightKg?: number
}

interface Props {
  fileId: number
  filename?: string
  /** Densità del materiale della parte (kg/dm³) per stimare il peso. */
  densityKgDm3?: number
  /** Applica ingombro/peso ai campi della parte (Grezzo X/Y/Z + Peso finito). */
  onApplyGeometry?: (g: StepGeometry) => void
  onClose: () => void
}

/** Volume del solido dai triangoli (teorema della divergenza). Positivo,
 *  in unità del modello (mm con linearUnit='millimeter'). Vale per solidi
 *  chiusi (i STEP prodotti da CAD lo sono); per shell aperte è indicativo. */
function meshVolume(meshes: { attributes: { position: { array: number[] } }; index: { array: number[] } }[]): number {
  let v = 0
  for (const m of meshes) {
    const p = m.attributes.position.array
    const idx = m.index.array
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
      v += (
        p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
      ) / 6
    }
  }
  return Math.abs(v)
}

// occt-import-js carica un WASM: inizializziamo una volta sola per sessione.
let occtPromise: ReturnType<typeof occtimportjs> | null = null
const getOcct = () => (occtPromise ??= occtimportjs({ locateFile: () => wasmUrl }))

/**
 * Anteprima 3D di un file STEP con misura punto-punto.
 * occt-import-js (WASM OpenCASCADE) tassella lo STEP in mesh → reso con three.js
 * (orbit/zoom/pan). In "Misura" due click sulla superficie danno la distanza.
 * Componente lazy-loaded: three + occt NON entrano nel bundle principale.
 */
interface OcctMeshLike {
  attributes: { position: { array: number[] } }
  index: { array: number[] }
  brep_faces?: { first: number; last: number }[]
}

/**
 * Ricava gli SPIGOLI VERI del pezzo (non la tessellazione): un lato di
 * triangolo è uno spigolo CAD se separa due facce diverse (`brep_faces`) o è di
 * bordo. Restituisce i vertici unici + gli spigoli come coppie di indici
 * (grafo) — servono a wireframe, snap e riconoscimento cerchi (diametri).
 * occt duplica i vertici per faccia → uniamo i punti per posizione.
 */
function extractFeatureEdges(meshes: OcctMeshLike[]): { vertices: THREE.Vector3[]; edges: [number, number][] } {
  const Q = 1000 // merge posizioni a 0.001 mm
  const vertices: THREE.Vector3[] = []
  const edges: [number, number][] = []
  // vmap/edgeSet sono PER-MESH: due solidi distinti che si toccano non
  // devono fondere i vertici (creerebbero giunzioni ad alto grado che
  // spezzano il walk dei cerchi). vertices/edges restano globali.
  for (const m of meshes) {
    const vmap = new Map<string, number>()
    const edgeSet = new Set<string>()
    const pos = m.attributes.position.array
    const idx = m.index.array
    const nTri = idx.length / 3
    const faceOf = new Int32Array(nTri).fill(-1)
    m.brep_faces?.forEach((f, fi) => { for (let t = f.first; t <= f.last && t < nTri; t++) faceOf[t] = fi })
    const pkey = (v: number) =>
      `${Math.round(pos[v * 3] * Q)},${Math.round(pos[v * 3 + 1] * Q)},${Math.round(pos[v * 3 + 2] * Q)}`
    const vidx = (v: number) => {
      const k = pkey(v)
      let i = vmap.get(k)
      if (i === undefined) { i = vertices.length; vmap.set(k, i); vertices.push(new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])) }
      return i
    }
    const acc = new Map<string, { faces: Set<number>; count: number; a: number; b: number }>()
    for (let t = 0; t < nTri; t++) {
      const vs = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]
      const ks = vs.map(pkey)
      for (let e = 0; e < 3; e++) {
        const ka = ks[e], kb = ks[(e + 1) % 3]
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        let rec = acc.get(ek)
        if (!rec) { rec = { faces: new Set(), count: 0, a: vs[e], b: vs[(e + 1) % 3] }; acc.set(ek, rec) }
        rec.faces.add(faceOf[t]); rec.count++
      }
    }
    for (const rec of acc.values()) {
      if (rec.faces.size > 1 || rec.count === 1) {   // spigolo CAD (tra facce) o bordo
        const ia = vidx(rec.a), ib = vidx(rec.b)
        if (ia === ib) continue
        const ek = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`
        if (!edgeSet.has(ek)) { edgeSet.add(ek); edges.push([ia, ib]) }
      }
    }
  }
  return { vertices, edges }
}

/** Risolve un sistema lineare 3×3 (Cramer). Null se singolare. */
function solve3(M: number[][], b: number[]): [number, number, number] | null {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M)
  if (Math.abs(D) < 1e-12) return null
  const col = (i: number) => M.map((row, r) => row.map((val, c) => (c === i ? b[r] : val)))
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D]
}

/** Fit di un cerchio su punti ~complanari (loop di spigoli). Ritorna centro,
 *  raggio e residuo relativo (per capire se è davvero circolare). */
function fitCircle(pts: THREE.Vector3[]): { center: THREE.Vector3; radius: number; residual: number; normal: THREE.Vector3 } | null {
  if (pts.length < 6) return null
  const c0 = new THREE.Vector3()
  pts.forEach(p => c0.add(p)); c0.multiplyScalar(1 / pts.length)
  // Normale del piano (Newell).
  const n = new THREE.Vector3()
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    n.x += (a.y - b.y) * (a.z + b.z)
    n.y += (a.z - b.z) * (a.x + b.x)
    n.z += (a.x - b.x) * (a.y + b.y)
  }
  if (n.lengthSq() < 1e-9) return null
  n.normalize()
  const u = new THREE.Vector3(1, 0, 0)
  if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0)
  u.crossVectors(n, u).normalize()
  const v = new THREE.Vector3().crossVectors(n, u).normalize()
  const xy = pts.map(p => { const d = p.clone().sub(c0); return [d.dot(u), d.dot(v)] as [number, number] })
  // Fit algebrico (Kåsa): x²+y² = A·x + B·y + C.
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, Sxz = 0, Syz = 0, Sz = 0
  const N = xy.length
  for (const [x, y] of xy) { const z = x * x + y * y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y; Sxz += x * z; Syz += y * z; Sz += z }
  const sol = solve3([[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, N]], [Sxz, Syz, Sz])
  if (!sol) return null
  const [A, B, C] = sol
  const cx = A / 2, cy = B / 2
  const radius = Math.sqrt(Math.max(C + cx * cx + cy * cy, 0))
  if (!(radius > 0)) return null
  let res = 0
  for (const [x, y] of xy) res += Math.abs(Math.hypot(x - cx, y - cy) - radius)
  const center = c0.clone().add(u.clone().multiplyScalar(cx)).add(v.clone().multiplyScalar(cy))
  return { center, radius, residual: res / (N * radius), normal: n }
}

export default function StepViewerModal({ fileId, filename, densityKgDm3, onApplyGeometry, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tool, setTool] = useState<'none' | 'measure' | 'diameter'>('none')
  const [distance, setDistance] = useState<number | null>(null)
  const [diameter, setDiameter] = useState<number | null>(null)
  const [geom, setGeom] = useState<StepGeometry | null>(null)

  // Riferimenti "vivi" usati dai handler senza rilanciare l'effetto.
  const toolRef = useRef(tool)
  toolRef.current = tool
  const apiRef = useRef<{ clearAll: () => void }>({ clearAll: () => {} })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frame = 0
    const cleanups: Array<() => void> = []

    async function init() {
      if (!mount) return
      let buf: ArrayBuffer
      try {
        const res = await api.get(`/files/${fileId}`, { responseType: 'arraybuffer' })
        buf = res.data as ArrayBuffer
      } catch {
        if (!disposed) { setError('Impossibile scaricare il file STEP'); setLoading(false) }
        return
      }
      let result
      try {
        const occt = await getOcct()
        // linearUnit='millimeter' → output SEMPRE in mm (a prescindere dall'unità del file).
        result = occt.ReadStepFile(new Uint8Array(buf), { linearUnit: 'millimeter' })
      } catch {
        if (!disposed) { setError('Errore nel motore 3D (WASM)'); setLoading(false) }
        return
      }
      if (disposed) return
      if (!result.success || !result.meshes?.length) {
        setError('STEP non leggibile o senza geometria'); setLoading(false); return
      }

      // ─── Scena ───────────────────────────────────────────────────────────
      const width = mount.clientWidth || 800
      const height = mount.clientHeight || 500
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf5f6f8)
      const group = new THREE.Group()

      for (const m of result.meshes) {
        const geom = new THREE.BufferGeometry()
        geom.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3))
        if (m.attributes.normal) geom.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3))
        else geom.computeVertexNormals()
        geom.setIndex(m.index.array)
        const col = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color(0x9aa4b2)
        const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.25, roughness: 0.6, side: THREE.DoubleSide })
        group.add(new THREE.Mesh(geom, mat))
      }
      scene.add(group)

      // Spigoli veri del pezzo: wireframe (aspetto CAD) + grafo per snap/diametri.
      const feat = extractFeatureEdges(result.meshes)
      const adj = new Map<number, number[]>()
      const addAdj = (k: number, val: number) => { const l = adj.get(k); if (l) l.push(val); else adj.set(k, [val]) }
      for (const [a, b] of feat.edges) { addAdj(a, b); addAdj(b, a) }
      if (feat.edges.length) {
        const wpos = new Float32Array(feat.vertices.length * 3)
        feat.vertices.forEach((v, i) => { wpos[i * 3] = v.x; wpos[i * 3 + 1] = v.y; wpos[i * 3 + 2] = v.z })
        const eg = new THREE.BufferGeometry()
        eg.setAttribute('position', new THREE.BufferAttribute(wpos, 3))
        eg.setIndex(feat.edges.flat())
        scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x334155 })))
      }

      // Centra + scala la camera sul bounding box.
      const bbox = new THREE.Box3().setFromObject(group)
      const size = new THREE.Vector3(); bbox.getSize(size)
      const center = new THREE.Vector3(); bbox.getCenter(center)
      const maxDim = Math.max(size.x, size.y, size.z) || 1

      // Ingombro + volume + peso stimato (mm / cm³ / kg).
      const volMm3 = meshVolume(result.meshes)
      const r2 = (n: number) => Math.round(n * 100) / 100
      setGeom({
        x: r2(size.x), y: r2(size.y), z: r2(size.z),
        volumeCm3: r2(volMm3 / 1000),
        weightKg: densityKgDm3 ? Math.round((volMm3 / 1e6) * densityKgDm3 * 1000) / 1000 : undefined,
      })

      const camera = new THREE.PerspectiveCamera(45, width / height, maxDim / 1000, maxDim * 100)
      camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim)
      camera.lookAt(center)

      scene.add(new THREE.AmbientLight(0xffffff, 0.7))
      const dir = new THREE.DirectionalLight(0xffffff, 0.9)
      dir.position.set(1, 1, 1)
      scene.add(dir)

      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(width, height)
      mount.appendChild(renderer.domElement)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.copy(center)
      controls.update()

      // ─── Overlay misure/diametri ─────────────────────────────────────────
      const raycaster = new THREE.Raycaster()
      const points: THREE.Vector3[] = []
      const overlay = new THREE.Group(); scene.add(overlay)   // marker + linea + cerchio

      const clearAll = () => {
        points.length = 0
        overlay.clear()
        setDistance(null)
        setDiameter(null)
      }
      apiRef.current.clearAll = clearAll

      const addMarker = (p: THREE.Vector3, color = 0x2563eb) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(maxDim * 0.012, 16, 16), new THREE.MeshBasicMaterial({ color }))
        s.position.copy(p); overlay.add(s)
      }
      const closestOnSeg = (a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) => {
        const ab = b.clone().sub(a)
        const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1), 0, 1)
        return a.clone().add(ab.multiplyScalar(t))
      }

      // Snap: vertice più vicino, poi spigolo più vicino, entro soglia.
      const snapPoint = (p: THREE.Vector3): THREE.Vector3 => {
        const thr = maxDim * 0.045
        let best: THREE.Vector3 | null = null, bd = thr
        for (const v of feat.vertices) { const d = p.distanceTo(v); if (d < bd) { bd = d; best = v } }
        if (best) return best.clone()
        let bp: THREE.Vector3 | null = null, be = thr
        for (const [ia, ib] of feat.edges) {
          const c = closestOnSeg(feat.vertices[ia], feat.vertices[ib], p)
          const d = p.distanceTo(c)
          if (d < be) { be = d; bp = c }
        }
        return bp ?? p.clone()
      }

      // Diametri: spigolo più vicino → anello di spigoli (gradi 2) → fit cerchio.
      const nearestEdge = (p: THREE.Vector3): number => {
        let bi = -1, bd = maxDim * 0.06
        for (let i = 0; i < feat.edges.length; i++) {
          const [ia, ib] = feat.edges[i]
          const d = p.distanceTo(closestOnSeg(feat.vertices[ia], feat.vertices[ib], p))
          if (d < bd) { bd = d; bi = i }
        }
        return bi
      }
      // Segue l'ARCO più liscio (non richiede grado 2): occt spezza i cilindri
      // sui seam, quindi i cerchi passano per vertici di grado 3. Ad ogni passo
      // sceglie il vicino che continua meglio la direzione; se la svolta è
      // troppo brusca non è un arco → stop.
      const findLoop = (edge: [number, number]): number[] | null => {
        const [start, second] = edge
        const loop = [start, second]
        let prev = start, cur = second
        for (let s = 0; s < 600; s++) {
          const nbrs = (adj.get(cur) ?? []).filter(x => x !== prev)
          if (!nbrs.length) return null
          const dc = feat.vertices[cur].clone().sub(feat.vertices[prev]).normalize()
          let best = -1, bd = -2
          for (const nx of nbrs) {
            const d = dc.dot(feat.vertices[nx].clone().sub(feat.vertices[cur]).normalize())
            if (d > bd) { bd = d; best = nx }
          }
          if (bd < 0.2) return null
          if (best === start) return loop
          loop.push(best); prev = cur; cur = best
        }
        return null
      }
      const drawCircle = (c: THREE.Vector3, radius: number, normal: THREE.Vector3) => {
        const u = new THREE.Vector3(1, 0, 0); if (Math.abs(normal.dot(u)) > 0.9) u.set(0, 1, 0)
        u.crossVectors(normal, u).normalize()
        const v = new THREE.Vector3().crossVectors(normal, u).normalize()
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2
          pts.push(c.clone().add(u.clone().multiplyScalar(Math.cos(a) * radius)).add(v.clone().multiplyScalar(Math.sin(a) * radius)))
        }
        overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xdc2626 })))
        addMarker(c, 0xdc2626)
      }

      const onClick = (ev: MouseEvent) => {
        const t = toolRef.current
        if (t === 'none' || !renderer) return
        const rect = renderer.domElement.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        const hit = raycaster.intersectObjects(group.children, true)[0]
        if (!hit) return

        if (t === 'measure') {
          const p = snapPoint(hit.point)
          if (points.length >= 2) clearAll()
          points.push(p); addMarker(p)
          if (points.length === 2) {
            overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x2563eb })))
            setDistance(points[0].distanceTo(points[1]))
          }
        } else if (t === 'diameter') {
          const ei = nearestEdge(hit.point)
          if (ei < 0) { toast.error('Avvicinati a uno spigolo'); return }
          const loop = findLoop(feat.edges[ei])
          if (!loop || loop.length < 8) { toast.error('Nessuno spigolo circolare qui'); return }
          const fit = fitCircle(loop.map(i => feat.vertices[i]))
          if (!fit || fit.residual > 0.04) { toast.error('Lo spigolo non è circolare'); return }
          clearAll()
          drawCircle(fit.center, fit.radius, fit.normal)
          setDiameter(fit.radius * 2)
        }
      }
      renderer.domElement.addEventListener('click', onClick)
      cleanups.push(() => renderer?.domElement.removeEventListener('click', onClick))

      const onResize = () => {
        if (!renderer) return
        const w = mount.clientWidth, h = mount.clientHeight
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
      }
      window.addEventListener('resize', onResize)
      cleanups.push(() => window.removeEventListener('resize', onResize))

      const loop = () => {
        if (disposed) return
        frame = requestAnimationFrame(loop)
        controls?.update()
        renderer?.render(scene, camera)
      }
      loop()
      setLoading(false)
    }

    init()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      cleanups.forEach(fn => fn())
      controls?.dispose()
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  }, [fileId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Box className="h-4 w-4" /> {filename || 'Modello STEP'}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-5 py-2">
          <Button size="sm" variant={tool === 'measure' ? 'default' : 'outline'}
            onClick={() => { setTool(t => t === 'measure' ? 'none' : 'measure'); apiRef.current.clearAll() }}
            disabled={loading || !!error}>
            <Ruler className="mr-1 h-3.5 w-3.5" /> Misura
          </Button>
          <Button size="sm" variant={tool === 'diameter' ? 'default' : 'outline'}
            onClick={() => { setTool(t => t === 'diameter' ? 'none' : 'diameter'); apiRef.current.clearAll() }}
            disabled={loading || !!error}>
            <Circle className="mr-1 h-3.5 w-3.5" /> Diametro
          </Button>
          <Button size="sm" variant="outline" onClick={() => apiRef.current.clearAll()} disabled={loading || !!error}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Azzera
          </Button>
          <span className="text-[12.5px] text-muted-foreground">
            {tool === 'measure' ? 'Clicca due punti (aggancia a spigoli e vertici).'
              : tool === 'diameter' ? 'Clicca su uno spigolo circolare (foro/cilindro).'
              : 'Trascina per ruotare · rotella per zoom.'}
          </span>
          {distance != null && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 font-mono text-[13px] font-semibold text-primary">
              {distance.toFixed(2)} mm
            </span>
          )}
          {diameter != null && (
            <span className="ml-auto rounded-full bg-danger/10 px-3 py-1 font-mono text-[13px] font-semibold text-danger">
              Ø {diameter.toFixed(2)} mm
            </span>
          )}
        </div>

        {geom && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-2 text-[12.5px]">
            <span className="text-muted-foreground">Ingombro: <span className="font-mono font-semibold text-foreground">{geom.x} × {geom.y} × {geom.z}</span> mm</span>
            <span className="text-muted-foreground">Volume: <span className="font-mono font-semibold text-foreground">{geom.volumeCm3}</span> cm³</span>
            {geom.weightKg != null && (
              <span className="text-muted-foreground">Peso stimato: <span className="font-mono font-semibold text-foreground">{geom.weightKg}</span> kg</span>
            )}
            {onApplyGeometry && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => onApplyGeometry(geom)} title="Compila Grezzo X/Y/Z e Peso finito dalla geometria">
                <Box className="mr-1 h-3.5 w-3.5" /> Applica al preventivo
              </Button>
            )}
          </div>
        )}

        <div className="relative flex-1" style={{ minHeight: 420 }}>
          <div ref={mountRef} className="absolute inset-0" />
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-primary">
              <span className="animate-pulse">Caricamento modello 3D…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-danger">{error}</div>
          )}
        </div>

        <div className="flex justify-end border-t border-border bg-muted px-5 py-3">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    </div>
  )
}
