import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box, X, Ruler, RotateCcw, Circle, Triangle, CircleDot, Spline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { toast } from 'sonner'
import {
  getOcct, readStep, tessellate, explodeFaces, explodeVertices, faceInfo, volume, boundingBox,
  minDistance, angleBetweenPlanes, type FaceInfo,
} from '@/lib/step/stepKernel'

export interface StepGeometry {
  x: number; y: number; z: number   // ingombro (bounding box) in mm
  volumeCm3: number
  weightKg?: number
  /** forma grezzo rilevata: prismatico (X/Y/Z) o tondo (diametro + lunghezza) */
  shape: 'prismatic' | 'round'
  diameter?: number   // se tondo
  length?: number     // se tondo
}

/** Rileva se il pezzo è un tondo o un prismatico dall'ingombro + facce.
 *  Tondo = il cilindro più grande ha diametro ≈ le due dim minori del bbox
 *  (il corpo è cilindrico); il grezzo è barra tonda Ø × lunghezza. */
function detectStockShape(faceInfos: FaceInfo[], bbox: { x: number; y: number; z: number }):
  { shape: 'prismatic' | 'round'; diameter?: number; length?: number } {
  const dims = [bbox.x, bbox.y, bbox.z].sort((a, b) => a - b)
  const radii = faceInfos.filter(f => f.surfaceType === 1 && f.radius).map(f => f.radius as number)
  if (radii.length) {
    const d = Math.max(...radii) * 2
    const tol = 0.03 * (dims[1] || 1)
    if (Math.abs(d - dims[0]) <= tol && Math.abs(d - dims[1]) <= tol) {
      const r2 = (n: number) => Math.round(n * 100) / 100
      return { shape: 'round', diameter: r2(d), length: r2(dims[2]) }
    }
  }
  return { shape: 'prismatic' }
}

interface Props {
  fileId: number
  filename?: string
  densityKgDm3?: number
  onApplyGeometry?: (g: StepGeometry) => void
  onClose: () => void
}

type Tool = 'none' | 'distance' | 'diameter' | 'angle' | 'interasse' | 'point'
type Result = { kind: Tool; value: number } | null

/** Distanza minima tra due rette (assi cilindro) — interasse tra fori.
 *  Assi paralleli → distanza perpendicolare; sghembi → formula generale. */
function axisToAxisDistance(a: FaceInfo, b: FaceInfo): number | null {
  if (!a.axisLocation || !a.axisDirection || !b.axisLocation || !b.axisDirection) return null
  const [P1, d1] = [a.axisLocation, a.axisDirection]
  const [P2, d2] = [b.axisLocation, b.axisDirection]
  const cr = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]]
  const cl = Math.hypot(cr[0], cr[1], cr[2])
  const w = [P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]]
  if (cl < 1e-9) { // paralleli
    const dot = w[0] * d1[0] + w[1] * d1[1] + w[2] * d1[2]
    return Math.hypot(w[0] - dot * d1[0], w[1] - dot * d1[1], w[2] - dot * d1[2])
  }
  return Math.abs(w[0] * cr[0] + w[1] * cr[1] + w[2] * cr[2]) / cl
}

/**
 * Visualizzatore STEP con motore CAD ESATTO (opencascade.js, B-rep).
 * A differenza del vecchio viewer (mesh + fit dai triangoli), qui ogni faccia
 * del modello è la faccia CAD vera: cliccandola si leggono raggio/distanza/
 * angolo esatti dalla geometria, non fittati. Lazy-loaded: il kernel WASM
 * (~50 MB) NON entra nel bundle principale.
 */
export default function StepViewerCad({ fileId, filename, densityKgDm3, onApplyGeometry, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('none')
  const [result, setResult] = useState<Result>(null)
  const [geom, setGeom] = useState<StepGeometry | null>(null)

  const toolRef = useRef(tool)
  toolRef.current = tool
  const apiRef = useRef<{ clearSelection: () => void }>({ clearSelection: () => {} })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frame = 0
    const cleanups: Array<() => void> = []
    // Oggetti OCCT da liberare all'unmount (evita leak WASM).
    const occtToFree: Array<{ delete: () => void }> = []

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

      let shape, faces, faceInfos: FaceInfo[], tess, vol: number
      let bbox: { x: number; y: number; z: number }, vertsRaw: Array<[number, number, number]>
      try {
        const oc = await getOcct()
        if (disposed) return
        shape = readStep(oc, buf)
        occtToFree.push(shape)
        faces = explodeFaces(oc, shape)
        faces.forEach(f => occtToFree.push(f))
        faceInfos = faces.map((f, i) => faceInfo(oc, f, i))
        tess = tessellate(oc, shape)
        vol = volume(oc, shape)
        bbox = boundingBox(oc, shape)
        vertsRaw = explodeVertices(oc, shape)
      } catch (e) {
        if (!disposed) {
          setError('Errore nel motore CAD (WASM): STEP non leggibile')
          setLoading(false)
        }
        if (import.meta.env.DEV) console.error('[StepViewerCad] kernel error', e)
        return
      }
      if (disposed) return
      if (!tess.positions.length) { setError('STEP senza geometria'); setLoading(false); return }

      // ─── Scena ───────────────────────────────────────────────────────────
      const width = mount.clientWidth || 800
      const height = mount.clientHeight || 500
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf5f6f8)
      const group = new THREE.Group()

      // Attributo posizione condiviso tra le mesh per-faccia (una geometria per
      // faccia CAD: così il raycast identifica subito la faccia vera).
      const posAttr = new THREE.Float32BufferAttribute(tess.positions, 3)
      const faceIndexLists: number[][] = faceInfos.map(() => [])
      for (let t = 0; t < tess.triangleFace.length; t++) {
        const fid = tess.triangleFace[t]
        faceIndexLists[fid].push(tess.indices[t * 3], tess.indices[t * 3 + 1], tess.indices[t * 3 + 2])
      }
      const baseColor = new THREE.Color(0x9aa4b2)
      const hiColor = new THREE.Color(0x2563eb)
      const faceMeshes: THREE.Mesh[] = []
      faceIndexLists.forEach((idxList, fid) => {
        if (!idxList.length) return
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', posAttr)
        g.setIndex(idxList)
        g.computeVertexNormals()
        const mat = new THREE.MeshStandardMaterial({ color: baseColor, metalness: 0.25, roughness: 0.6, side: THREE.DoubleSide })
        const mesh = new THREE.Mesh(g, mat)
        mesh.userData.faceId = fid
        faceMeshes.push(mesh)
        group.add(mesh)
      })
      scene.add(group)

      // Wireframe stile CAD: spigoli veri via EdgesGeometry (angolo soglia).
      const merged = new THREE.BufferGeometry()
      merged.setAttribute('position', posAttr)
      merged.setIndex(Array.from(tess.indices))
      const edges = new THREE.EdgesGeometry(merged, 20)
      scene.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x334155 })))

      // Camera framing sul bounding box del gruppo.
      const box3 = new THREE.Box3().setFromObject(group)
      const size = new THREE.Vector3(); box3.getSize(size)
      const center = new THREE.Vector3(); box3.getCenter(center)
      const maxDim = Math.max(size.x, size.y, size.z) || 1

      // Ingombro / volume / peso ESATTI (dal kernel, non dai triangoli).
      const r2 = (n: number) => Math.round(n * 100) / 100
      const stock = detectStockShape(faceInfos, bbox)
      setGeom({
        x: r2(bbox.x), y: r2(bbox.y), z: r2(bbox.z),
        volumeCm3: r2(vol / 1000),
        weightKg: densityKgDm3 ? Math.round((vol / 1e6) * densityKgDm3 * 1000) / 1000 : undefined,
        shape: stock.shape, diameter: stock.diameter, length: stock.length,
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

      // ─── Selezione + misure ──────────────────────────────────────────────
      const raycaster = new THREE.Raycaster()
      const verts = vertsRaw.map(([x, y, z]) => new THREE.Vector3(x, y, z))
      const overlay = new THREE.Group(); scene.add(overlay)   // marcatori + linee misura
      const selected: number[] = []          // facce selezionate (diameter/distance/angle/interasse)
      const pickedPoints: THREE.Vector3[] = []   // punti selezionati (tool punto)

      const setFaceColor = (fid: number, col: THREE.Color) => {
        const m = faceMeshes.find(x => x.userData.faceId === fid)
        if (m) (m.material as THREE.MeshStandardMaterial).color.copy(col)
      }
      const addMarker = (p: THREE.Vector3, color = 0x2563eb) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(maxDim * 0.012, 16, 16), new THREE.MeshBasicMaterial({ color }))
        m.position.copy(p); overlay.add(m)
      }
      const addLine = (a: THREE.Vector3, b: THREE.Vector3, color = 0x2563eb) =>
        overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color })))
      const clearSelection = () => {
        selected.forEach(fid => setFaceColor(fid, baseColor))
        selected.length = 0
        pickedPoints.length = 0
        overlay.clear()
        setResult(null)
      }
      apiRef.current.clearSelection = clearSelection

      const rayHit = (ev: MouseEvent): THREE.Intersection | null => {
        if (!renderer) return null
        const rect = renderer.domElement.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        return raycaster.intersectObjects(faceMeshes, false)[0] ?? null
      }
      // Snap del punto cliccato al vertice CAD più vicino (entro soglia), così
      // il tool punto aggancia gli spigoli veri; altrimenti punto libero sulla faccia.
      const snapToVertex = (p: THREE.Vector3): THREE.Vector3 => {
        const thr = maxDim * 0.04
        let best: THREE.Vector3 | null = null, bd = thr
        for (const v of verts) { const d = p.distanceTo(v); if (d < bd) { bd = d; best = v } }
        return best ? best.clone() : p.clone()
      }

      const onClick = async (ev: MouseEvent) => {
        const t = toolRef.current
        if (t === 'none') return
        const hit = rayHit(ev)
        if (!hit) return

        // Tool PUNTO: due punti (snap ai vertici) → distanza euclidea.
        if (t === 'point') {
          if (pickedPoints.length >= 2) clearSelection()
          const p = snapToVertex(hit.point)
          pickedPoints.push(p); addMarker(p)
          if (pickedPoints.length === 2) {
            addLine(pickedPoints[0], pickedPoints[1])
            setResult({ kind: 'point', value: pickedPoints[0].distanceTo(pickedPoints[1]) })
          }
          return
        }

        const fid = hit.object.userData.faceId as number
        const info = faceInfos[fid]

        if (t === 'diameter') {
          clearSelection()
          if (info.radius == null) { toast.error('Clicca una faccia cilindrica o sferica (foro/albero)'); return }
          selected.push(fid); setFaceColor(fid, hiColor)
          setResult({ kind: 'diameter', value: info.radius * 2 })
          return
        }

        // due facce: distanza / angolo / interasse
        if (t === 'angle' && info.planeNormal == null) { toast.error('Per l’angolo clicca due facce piane'); return }
        if (t === 'interasse' && info.axisDirection == null) { toast.error('Per l’interasse clicca due fori/cilindri'); return }
        if (selected.length >= 2) clearSelection()
        if (selected.includes(fid)) return
        selected.push(fid); setFaceColor(fid, hiColor)
        if (selected.length === 2) {
          const [a, b] = selected
          try {
            if (t === 'distance') {
              const oc = await getOcct()
              setResult({ kind: 'distance', value: minDistance(oc, faces![a], faces![b]) })
            } else if (t === 'interasse') {
              const d = axisToAxisDistance(faceInfos[a], faceInfos[b])
              if (d == null) { toast.error('Servono due fori/cilindri'); clearSelection(); return }
              setResult({ kind: 'interasse', value: d })
            } else {
              const na = faceInfos[a].planeNormal, nb = faceInfos[b].planeNormal
              if (!na || !nb) { toast.error('Servono due facce piane'); clearSelection(); return }
              const oc = await getOcct()
              setResult({ kind: 'angle', value: angleBetweenPlanes(oc, na, nb) })
            }
          } catch {
            toast.error('Errore nel calcolo della misura')
            clearSelection()
          }
        }
      }
      // Distinzione clic-vero vs trascinamento: ruotare/pan con OrbitControls
      // termina con un mouseup che altrimenti scatenerebbe un 'click' →
      // selezioni accidentali mentre si gira il modello. Selezioniamo SOLO se il
      // puntatore non si è spostato oltre soglia tra press e release.
      let downX = 0, downY = 0
      const DRAG_PX = 5
      const onPointerDown = (ev: PointerEvent) => { downX = ev.clientX; downY = ev.clientY }
      const onPointerUp = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - downX, ev.clientY - downY) <= DRAG_PX) onClick(ev)
      }
      renderer.domElement.addEventListener('pointerdown', onPointerDown)
      renderer.domElement.addEventListener('pointerup', onPointerUp)
      cleanups.push(() => {
        renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer?.domElement.removeEventListener('pointerup', onPointerUp)
      })

      const onResize = () => {
        if (!renderer) return
        const w = mount.clientWidth, h = mount.clientHeight
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
      }
      window.addEventListener('resize', onResize)
      cleanups.push(() => window.removeEventListener('resize', onResize))

      const renderLoop = () => {
        if (disposed) return
        frame = requestAnimationFrame(renderLoop)
        controls?.update()
        renderer?.render(scene, camera)
      }
      renderLoop()
      setLoading(false)
    }

    init()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      cleanups.forEach(fn => fn())
      controls?.dispose()
      if (renderer) { renderer.dispose(); renderer.domElement.remove() }
      // Libera gli oggetti OCCT (shape + facce) per non trattenere memoria WASM.
      occtToFree.forEach(o => { try { o.delete() } catch { /* già liberato */ } })
    }
  }, [fileId])

  const switchTool = (t: Tool) => {
    setTool(cur => cur === t ? 'none' : t)
    apiRef.current.clearSelection()
  }
  const hint =
    tool === 'distance' ? 'Clicca due facce → distanza minima (facce parallele = spessore).'
    : tool === 'diameter' ? 'Clicca la parete di un foro o cilindro → diametro esatto.'
    : tool === 'angle' ? 'Clicca due facce piane → angolo tra loro.'
    : tool === 'interasse' ? 'Clicca due fori/cilindri → interasse (distanza tra gli assi).'
    : tool === 'point' ? 'Clicca due punti (aggancia ai vertici) → distanza punto-punto.'
    : 'Trascina per ruotare · rotella per zoom.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Box className="h-4 w-4" /> {filename || 'Modello STEP'} <span className="text-[11px] font-normal text-muted-foreground">· CAD esatto</span>
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-5 py-2">
          <Button size="sm" variant={tool === 'distance' ? 'default' : 'outline'} onClick={() => switchTool('distance')} disabled={loading || !!error}>
            <Ruler className="mr-1 h-3.5 w-3.5" /> Distanza
          </Button>
          <Button size="sm" variant={tool === 'diameter' ? 'default' : 'outline'} onClick={() => switchTool('diameter')} disabled={loading || !!error}>
            <Circle className="mr-1 h-3.5 w-3.5" /> Diametro
          </Button>
          <Button size="sm" variant={tool === 'angle' ? 'default' : 'outline'} onClick={() => switchTool('angle')} disabled={loading || !!error}>
            <Triangle className="mr-1 h-3.5 w-3.5" /> Angolo
          </Button>
          <Button size="sm" variant={tool === 'interasse' ? 'default' : 'outline'} onClick={() => switchTool('interasse')} disabled={loading || !!error}>
            <CircleDot className="mr-1 h-3.5 w-3.5" /> Interasse
          </Button>
          <Button size="sm" variant={tool === 'point' ? 'default' : 'outline'} onClick={() => switchTool('point')} disabled={loading || !!error}>
            <Spline className="mr-1 h-3.5 w-3.5" /> Punto
          </Button>
          <Button size="sm" variant="outline" onClick={() => apiRef.current.clearSelection()} disabled={loading || !!error}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Azzera
          </Button>
          <span className="text-[12.5px] text-muted-foreground">{hint}</span>
          {result && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 font-mono text-[13px] font-semibold text-primary">
              {result.kind === 'diameter' ? `Ø ${result.value.toFixed(2)} mm`
                : result.kind === 'angle' ? `${result.value.toFixed(2)}°`
                : result.kind === 'interasse' ? `Interasse ${result.value.toFixed(2)} mm`
                : `${result.value.toFixed(2)} mm`}
            </span>
          )}
        </div>

        {geom && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-2 text-[12.5px]">
            <span className="text-muted-foreground">Ingombro: <span className="font-mono font-semibold text-foreground">{geom.x} × {geom.y} × {geom.z}</span> mm</span>
            <span className="text-muted-foreground">Forma: <span className="font-mono font-semibold text-foreground">{geom.shape === 'round' ? `Tondo Ø${geom.diameter} × ${geom.length}` : 'Prismatico'}</span></span>
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
              <span className="animate-pulse">Caricamento modello 3D (motore CAD)…</span>
            </div>
          )}
          {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-danger">{error}</div>}
        </div>

        <div className="flex justify-end border-t border-border bg-muted px-5 py-3">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    </div>
  )
}
