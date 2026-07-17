import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box, X, Ruler, RotateCcw, Circle, Triangle, CircleDot, Spline, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { toast } from 'sonner'
import {
  getOcct, readStep, tessellate, explodeFaces, explodeVertices, faceInfo, volume, boundingBox,
  faceDistanceDetail, angleBetweenPlanes, type FaceInfo,
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

/** Etichetta relazione tra due facce piane dall'angolo (tolleranza 1°). */
function angleRelation(deg: number): string {
  const d = ((deg % 180) + 180) % 180
  if (d < 1 || d > 179) return ' · parallele'
  if (Math.abs(d - 90) < 1) return ' · perpendicolari'
  return ''
}

/**
 * Visualizzatore STEP con motore CAD ESATTO (opencascade.js, B-rep).
 * A differenza del vecchio viewer (mesh + fit dai triangoli), qui ogni faccia
 * del modello è la faccia CAD vera: cliccandola si leggono raggio/distanza/
 * angolo esatti dalla geometria, non fittati. Lazy-loaded: il kernel WASM
 * (~50 MB) NON entra nel bundle principale.
 */
// F3: peso finito dal volume esatto (mm³) e dalla densità del materiale. In
// funzione a parte così l'inizializzazione e il ricalcolo su cambio materiale
// usano la stessa formula.
function stepWeightKg(volMm3: number, densityKgDm3?: number): number | undefined {
  return densityKgDm3 ? Math.round((volMm3 / 1e6) * densityKgDm3 * 1000) / 1000 : undefined
}

// F4: la tassellazione del kernel OCCT è sincrona sul main thread → un assieme
// grosso freeza la UI per secondi senza feedback. Il numero di facce (dal solo
// esplode topologico, economico) è un buon proxy della complessità PRIMA della
// tassellazione (la parte pesante). Oltre soglia interrompiamo con un messaggio
// esplicito invece di bloccare: il viewer serve al singolo pezzo, non agli
// assiemi. Euristica: un pezzo lavorato complesso resta ben sotto le 4000 facce.
const MAX_STEP_FACES = 4000

export default function StepViewerCad({ fileId, filename, densityKgDm3, onApplyGeometry, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('none')
  const [result, setResult] = useState<Result>(null)
  const [geom, setGeom] = useState<StepGeometry | null>(null)
  // Volume esatto (mm³) dell'ultimo STEP tessellato: serve a ricalcolare il
  // peso quando cambia il materiale senza ri-tessellare (F3).
  const rawVolRef = useRef(0)

  const toolRef = useRef(tool)
  toolRef.current = tool
  const [xray, setXray] = useState(false)
  const apiRef = useRef<{ clearSelection: () => void; applyXray: (on: boolean) => void }>({
    clearSelection: () => {}, applyXray: () => {},
  })

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
        // F4: interrompi PRIMA della tassellazione (pesante) se troppe facce.
        if (faces.length > MAX_STEP_FACES) {
          if (!disposed) {
            setError(`STEP troppo complesso per l'anteprima (${faces.length} facce): `
              + `probabilmente un assieme. Imposta il grezzo manualmente.`)
            setLoading(false)
          }
          return   // gli oggetti OCCT già in occtToFree vengono liberati all'unmount
        }
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
      rawVolRef.current = vol
      setGeom({
        x: r2(bbox.x), y: r2(bbox.y), z: r2(bbox.z),
        volumeCm3: r2(vol / 1000),
        weightKg: stepWeightKg(vol, densityKgDm3),
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
      const selectedHits: THREE.Vector3[] = []   // punto cliccato su ciascuna faccia (ancoraggio quota)
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
      // Etichetta di quota (valore) nel modello: sprite con testo su canvas,
      // sempre rivolta alla camera e sopra la geometria (depthTest off).
      const midpoint = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5)
      // Pillola come le badge dell'UI (bg-primary/10 + testo primary, mono).
      const pillPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
        c.beginPath()
        c.moveTo(x + r, y)
        c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r)
        c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
      }
      const addLabel = (text: string, pos: THREE.Vector3) => {
        const dpr = 2, font = 34 * dpr, padX = 22 * dpr, padY = 12 * dpr
        const fontSpec = `600 ${font}px ui-monospace, "SFMono-Regular", Menlo, monospace`
        const meas = document.createElement('canvas').getContext('2d')!
        meas.font = fontSpec
        const tw = Math.ceil(meas.measureText(text).width)
        const canvas = document.createElement('canvas')
        canvas.width = tw + padX * 2; canvas.height = font + padY * 2
        const ctx = canvas.getContext('2d')!
        pillPath(ctx, 1, 1, canvas.width - 2, canvas.height - 2, canvas.height / 2)
        ctx.fillStyle = 'rgba(233, 240, 254, 0.96)'; ctx.fill()          // primary/10 su chiaro
        ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = 'rgba(37, 99, 235, 0.22)'; ctx.stroke()
        ctx.font = fontSpec; ctx.fillStyle = '#2563eb'                    // testo primary
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + dpr)
        const tex = new THREE.CanvasTexture(canvas); tex.minFilter = THREE.LinearFilter
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
        const h = maxDim * 0.075
        sprite.scale.set(h * (canvas.width / canvas.height), h, 1)
        sprite.position.copy(pos); sprite.renderOrder = 999
        overlay.add(sprite)
      }
      const clearSelection = () => {
        selected.forEach(fid => setFaceColor(fid, baseColor))
        selected.length = 0
        selectedHits.length = 0
        pickedPoints.length = 0
        overlay.clear()
        setResult(null)
      }
      apiRef.current.clearSelection = clearSelection
      // Vista raggi X: facce semitrasparenti (depthWrite off) → si vedono gli
      // interni lavorati. Il wireframe degli spigoli resta visibile attraverso.
      apiRef.current.applyXray = (on: boolean) => {
        faceMeshes.forEach(m => {
          const mat = m.material as THREE.MeshStandardMaterial
          mat.transparent = on
          mat.opacity = on ? 0.22 : 1
          mat.depthWrite = !on
          mat.needsUpdate = true
        })
      }

      // Evidenziazione faccia al passaggio del mouse (solo con uno strumento
      // faccia attivo). Il raycast è throttlato al frame: pointermove salva solo
      // l'ultima posizione, il render loop la elabora.
      const hoverColor = new THREE.Color(0x93c5fd)
      const FACE_TOOLS = new Set<Tool>(['distance', 'diameter', 'angle', 'interasse'])
      let hoverNDC: THREE.Vector2 | null = null
      let hoveredFaceId: number | null = null
      const processHover = () => {
        const active = FACE_TOOLS.has(toolRef.current)
        if (!active) {
          if (hoveredFaceId != null) {
            if (!selected.includes(hoveredFaceId)) setFaceColor(hoveredFaceId, baseColor)
            hoveredFaceId = null
          }
          return
        }
        if (!hoverNDC) return
        raycaster.setFromCamera(hoverNDC, camera)
        const hit = raycaster.intersectObjects(faceMeshes, false)[0]
        const fid = hit ? (hit.object.userData.faceId as number) : null
        hoverNDC = null
        if (fid === hoveredFaceId) return
        if (hoveredFaceId != null && !selected.includes(hoveredFaceId)) setFaceColor(hoveredFaceId, baseColor)
        hoveredFaceId = fid
        if (fid != null && !selected.includes(fid)) setFaceColor(fid, hoverColor)
      }

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
            const value = pickedPoints[0].distanceTo(pickedPoints[1])
            addLabel(`${value.toFixed(2)} mm`, midpoint(pickedPoints[0], pickedPoints[1]))
            setResult({ kind: 'point', value })
          }
          return
        }

        const fid = hit.object.userData.faceId as number
        const info = faceInfos[fid]

        if (t === 'diameter') {
          clearSelection()
          if (info.radius == null) { toast.error('Clicca una faccia cilindrica o sferica (foro/albero)'); return }
          selected.push(fid); setFaceColor(fid, hiColor)
          addLabel(`Ø ${(info.radius * 2).toFixed(2)} mm`, hit.point)
          setResult({ kind: 'diameter', value: info.radius * 2 })
          return
        }

        // due facce: distanza / angolo / interasse
        if (t === 'angle' && info.planeNormal == null) { toast.error('Per l’angolo clicca due facce piane'); return }
        if (t === 'interasse' && info.axisDirection == null) { toast.error('Per l’interasse clicca due fori/cilindri'); return }
        if (selected.length >= 2) clearSelection()
        if (selected.includes(fid)) return
        selected.push(fid); setFaceColor(fid, hiColor); selectedHits.push(hit.point.clone())
        if (selected.length === 2) {
          const [a, b] = selected
          try {
            if (t === 'distance') {
              const oc = await getOcct()
              const det = faceDistanceDetail(oc, faces![a], faces![b])
              const q1 = new THREE.Vector3(...det.p1), q2 = new THREE.Vector3(...det.p2)
              addLine(q1, q2); addMarker(q1); addMarker(q2)
              addLabel(`${det.distance.toFixed(2)} mm`, midpoint(q1, q2))
              setResult({ kind: 'distance', value: det.distance })
            } else if (t === 'interasse') {
              const d = axisToAxisDistance(faceInfos[a], faceInfos[b])
              if (d == null) { toast.error('Servono due fori/cilindri'); clearSelection(); return }
              addLine(selectedHits[0], selectedHits[1])
              addLabel(`Interasse ${d.toFixed(2)} mm`, midpoint(selectedHits[0], selectedHits[1]))
              setResult({ kind: 'interasse', value: d })
            } else {
              const na = faceInfos[a].planeNormal, nb = faceInfos[b].planeNormal
              if (!na || !nb) { toast.error('Servono due facce piane'); clearSelection(); return }
              const oc = await getOcct()
              const ang = angleBetweenPlanes(oc, na, nb)
              addLabel(`${ang.toFixed(2)}°${angleRelation(ang)}`, midpoint(selectedHits[0], selectedHits[1]))
              setResult({ kind: 'angle', value: ang })
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
      const onPointerMove = (ev: PointerEvent) => {
        if (!renderer) return
        const rect = renderer.domElement.getBoundingClientRect()
        hoverNDC = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        )
      }
      renderer.domElement.addEventListener('pointerdown', onPointerDown)
      renderer.domElement.addEventListener('pointerup', onPointerUp)
      renderer.domElement.addEventListener('pointermove', onPointerMove)
      cleanups.push(() => {
        renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer?.domElement.removeEventListener('pointerup', onPointerUp)
        renderer?.domElement.removeEventListener('pointermove', onPointerMove)
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
        processHover()
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

  // F3: se il materiale (densità) cambia mentre il viewer è aperto, ricalcola
  // solo il peso dal volume già noto — senza ri-eseguire il kernel STEP (che
  // gira sul solo cambio di fileId). Evita di salvare un peso stantìo con
  // "Applica al preventivo".
  useEffect(() => {
    setGeom(g => {
      if (!g) return g
      const w = stepWeightKg(rawVolRef.current, densityKgDm3)
      return w === g.weightKg ? g : { ...g, weightKg: w }
    })
  }, [densityKgDm3])

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
      <div className="flex h-[92vh] w-full max-w-[1400px] flex-col rounded-lg bg-card shadow-xl">
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
          <Button size="sm" variant={xray ? 'default' : 'outline'} title="Vista in trasparenza per vedere gli interni"
            onClick={() => { const on = !xray; setXray(on); apiRef.current.applyXray(on) }} disabled={loading || !!error}>
            <Eye className="mr-1 h-3.5 w-3.5" /> Raggi X
          </Button>
          <span className="text-[12.5px] text-muted-foreground">{hint}</span>
          {result && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 font-mono text-[13px] font-semibold text-primary">
              {result.kind === 'diameter' ? `Ø ${result.value.toFixed(2)} mm`
                : result.kind === 'angle' ? `${result.value.toFixed(2)}°${angleRelation(result.value)}`
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
            {geom.weightKg != null ? (
              <span className="text-muted-foreground">Peso finito: <span className="font-mono font-semibold text-foreground">{geom.weightKg}</span> kg</span>
            ) : (
              <span className="italic text-muted-foreground/70">Peso: seleziona un materiale sulla parte per stimarlo</span>
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
