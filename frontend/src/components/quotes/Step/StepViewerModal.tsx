import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import occtimportjs from 'occt-import-js'
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'
import { Box, X, Ruler, RotateCcw } from 'lucide-react'
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
 * bordo. Restituisce i segmenti (per il wireframe) + i vertici unici (per lo
 * snap). occt duplica i vertici per faccia → uniamo i punti per posizione.
 */
function extractFeatureEdges(meshes: OcctMeshLike[]): { segments: Float32Array; vertices: THREE.Vector3[] } {
  const seg: number[] = []
  const verts = new Map<string, THREE.Vector3>()
  const Q = 1000 // risoluzione merge posizioni: 0.001 mm
  for (const m of meshes) {
    const pos = m.attributes.position.array
    const idx = m.index.array
    const nTri = idx.length / 3
    const faceOf = new Int32Array(nTri).fill(-1)
    m.brep_faces?.forEach((f, fi) => { for (let t = f.first; t <= f.last && t < nTri; t++) faceOf[t] = fi })
    const key = (v: number) =>
      `${Math.round(pos[v * 3] * Q)},${Math.round(pos[v * 3 + 1] * Q)},${Math.round(pos[v * 3 + 2] * Q)}`
    const edges = new Map<string, { faces: Set<number>; count: number; a: number; b: number }>()
    for (let t = 0; t < nTri; t++) {
      const vs = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]
      const ks = vs.map(key)
      for (let e = 0; e < 3; e++) {
        const ka = ks[e], kb = ks[(e + 1) % 3]
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        let rec = edges.get(ek)
        if (!rec) { rec = { faces: new Set(), count: 0, a: vs[e], b: vs[(e + 1) % 3] }; edges.set(ek, rec) }
        rec.faces.add(faceOf[t]); rec.count++
      }
    }
    for (const rec of edges.values()) {
      if (rec.faces.size > 1 || rec.count === 1) {   // spigolo CAD (tra facce) o bordo
        seg.push(pos[rec.a * 3], pos[rec.a * 3 + 1], pos[rec.a * 3 + 2], pos[rec.b * 3], pos[rec.b * 3 + 1], pos[rec.b * 3 + 2])
        for (const v of [rec.a, rec.b]) {
          const k = key(v)
          if (!verts.has(k)) verts.set(k, new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]))
        }
      }
    }
  }
  return { segments: new Float32Array(seg), vertices: [...verts.values()] }
}

export default function StepViewerModal({ fileId, filename, densityKgDm3, onApplyGeometry, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [measure, setMeasure] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [geom, setGeom] = useState<StepGeometry | null>(null)

  // Riferimenti "vivi" usati dai handler senza rilanciare l'effetto.
  const measureRef = useRef(measure)
  measureRef.current = measure
  const apiRef = useRef<{ clearMeasure: () => void }>({ clearMeasure: () => {} })

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

      // Spigoli veri del pezzo: wireframe visibile (aspetto CAD) + base per lo snap.
      const feat = extractFeatureEdges(result.meshes)
      if (feat.segments.length) {
        const eg = new THREE.BufferGeometry()
        eg.setAttribute('position', new THREE.BufferAttribute(feat.segments, 3))
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

      // ─── Misura punto-punto ──────────────────────────────────────────────
      const raycaster = new THREE.Raycaster()
      const points: THREE.Vector3[] = []
      const markers = new THREE.Group(); scene.add(markers)
      let line: THREE.Line | null = null

      const clearMeasure = () => {
        points.length = 0
        markers.clear()
        if (line) { scene.remove(line); line.geometry.dispose(); line = null }
        setDistance(null)
      }
      apiRef.current.clearMeasure = clearMeasure

      const addMarker = (p: THREE.Vector3) => {
        const s = new THREE.Mesh(
          new THREE.SphereGeometry(maxDim * 0.012, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x2563eb }),
        )
        s.position.copy(p); markers.add(s)
      }

      // Snap: aggancia il punto cliccato al vertice CAD più vicino, poi allo
      // spigolo più vicino, entro una soglia relativa alla dimensione del pezzo.
      const closestOnSeg = (a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) => {
        const ab = b.clone().sub(a)
        const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1), 0, 1)
        return a.clone().add(ab.multiplyScalar(t))
      }
      const snapPoint = (p: THREE.Vector3): THREE.Vector3 => {
        const thr = maxDim * 0.045
        let best: THREE.Vector3 | null = null, bd = thr
        for (const v of feat.vertices) { const d = p.distanceTo(v); if (d < bd) { bd = d; best = v } }
        if (best) return best.clone()
        let bp: THREE.Vector3 | null = null, be = thr
        for (let i = 0; i + 5 < feat.segments.length; i += 6) {
          const a = new THREE.Vector3(feat.segments[i], feat.segments[i + 1], feat.segments[i + 2])
          const b = new THREE.Vector3(feat.segments[i + 3], feat.segments[i + 4], feat.segments[i + 5])
          const c = closestOnSeg(a, b, p)
          const d = p.distanceTo(c)
          if (d < be) { be = d; bp = c }
        }
        return bp ?? p.clone()
      }

      const onClick = (ev: MouseEvent) => {
        if (!measureRef.current || !renderer) return
        const rect = renderer.domElement.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        const hit = raycaster.intersectObjects(group.children, true)[0]
        if (!hit) return
        const p = snapPoint(hit.point)
        if (points.length >= 2) clearMeasure()
        points.push(p)
        addMarker(p)
        if (points.length === 2) {
          const g = new THREE.BufferGeometry().setFromPoints(points)
          line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x2563eb }))
          scene.add(line)
          setDistance(points[0].distanceTo(points[1]))
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
          <Button
            size="sm"
            variant={measure ? 'default' : 'outline'}
            onClick={() => { setMeasure(m => !m); if (measure) apiRef.current.clearMeasure() }}
            disabled={loading || !!error}
          >
            <Ruler className="mr-1 h-3.5 w-3.5" /> Misura
          </Button>
          <Button size="sm" variant="outline" onClick={() => apiRef.current.clearMeasure()} disabled={loading || !!error}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Azzera
          </Button>
          <span className="text-[12.5px] text-muted-foreground">
            {measure ? 'Clicca due punti (aggancia automaticamente a spigoli e vertici).' : 'Trascina per ruotare · rotella per zoom.'}
          </span>
          {distance != null && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 font-mono text-[13px] font-semibold text-primary">
              {distance.toFixed(2)} mm
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
