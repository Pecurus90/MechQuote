// Kernel CAD (OpenCASCADE via WASM) per misure ESATTE su file STEP (B-rep).
//
// A differenza di occt-import-js (che dà solo la mesh tassellata), qui usiamo
// il kernel OCCT completo: si legge il B-rep, si classifica ogni superficie
// (piano/cilindro/cono/sfera) e si interrogano raggi, distanze, volumi in modo
// esatto — non fittati dalla tassellazione.
//
// ⚠️ Ogni chiamata OCCT qui è stata verificata eseguendola in Node contro
// opencascade.js 2.0 (round-trip STEP write→read, foro Ø12 → cilindro R=6
// esatto, volume/ingombro/spessore/angolo esatti, tassellazione con mappa
// triangolo→faccia). Le firme (_1/_2, enum interi ABI OCCT) dipendono dalla
// versione: se si aggiorna opencascade.js, riverificare.
//
// Il WASM è ~50 MB: il modulo è pensato per import DINAMICO (lazy), così non
// entra nel bundle principale — si carica solo all'apertura di un modello 3D.
import initOpenCascade, {
  type OpenCascadeInstance, type TopoDS_Shape, type TopoDS_Face,
  type TopAbs_ShapeEnum,
} from 'opencascade.js'
// eslint-disable-next-line import/no-unresolved -- asset URL risolto da Vite a runtime
import ocWasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url'

export type OC = OpenCascadeInstance

/** Tipo di superficie CAD (etichette IT + valore ABI OCCT GeomAbs_SurfaceType). */
export const SURFACE_TYPES: Record<number, string> = {
  0: 'Piano', 1: 'Cilindro', 2: 'Cono', 3: 'Sfera', 4: 'Toro',
  5: 'Bezier', 6: 'NURBS', 7: 'Rivoluzione', 8: 'Estrusione', 9: 'Offset', 10: 'Altro',
}

export interface FaceInfo {
  /** indice faccia nell'ordine di TopExp_Explorer (== faceId nella mesh) */
  index: number
  surfaceType: number
  surfaceLabel: string
  /** presente per cilindro/sfera (mm) */
  radius?: number
  /** semiangolo cono in gradi */
  coneSemiAngleDeg?: number
  /** normale del piano (solo per superfici piane) */
  planeNormal?: [number, number, number]
}

export interface TessellationData {
  positions: Float32Array
  indices: Uint32Array
  /** per ogni triangolo, l'indice della faccia CAD di provenienza (per il picking) */
  triangleFace: Uint32Array
}

export interface BBox { x: number; y: number; z: number }

// ─── init (browser, lazy) ────────────────────────────────────────────────────
let ocPromise: Promise<OC> | null = null
/** Inizializza (una volta) il kernel OCCT. Import dinamico consigliato dal chiamante. */
export function getOcct(): Promise<OC> {
  return (ocPromise ??= initOpenCascade({ mainWasm: ocWasmUrl }))
}

// ─── helpers ──────────────────────────────────────────────────────────────────
// Gli enum embind tornano come oggetti con .value; normalizziamo a numero.
const enumVal = (v: unknown): number =>
  (v !== null && typeof v === 'object' && 'value' in v) ? (v as { value: number }).value : (v as number)

// opencascade.js tipizza i costruttori/metodi col TIPO enum, ma a runtime si
// passa il MEMBRO (verificato in Node). Cast necessario, valore runtime corretto.
const asShapeEnum = (m: unknown) => m as unknown as TopAbs_ShapeEnum

/** Tutte le facce (TopoDS_Face) di uno shape, nell'ordine di esplorazione. */
export function explodeFaces(oc: OC, shape: TopoDS_Shape): TopoDS_Face[] {
  const out: TopoDS_Face[] = []
  const exp = new oc.TopExp_Explorer_2(
    shape, asShapeEnum(oc.TopAbs_ShapeEnum.TopAbs_FACE), asShapeEnum(oc.TopAbs_ShapeEnum.TopAbs_SHAPE),
  )
  while (exp.More()) { out.push(oc.TopoDS.Face_1(exp.Current())); exp.Next() }
  exp.delete()
  return out
}

/** Legge un buffer STEP in un TopoDS_Shape (path reale dell'app). */
export function readStep(oc: OC, buffer: ArrayBuffer): TopoDS_Shape {
  const name = `/mq_${Math.abs(hashBuf(buffer))}.step`
  oc.FS.writeFile(name, new Uint8Array(buffer))
  try {
    const reader = new oc.STEPControl_Reader_1()
    const status = reader.ReadFile(name)
    if (enumVal(status) !== enumVal(oc.IFSelect_ReturnStatus.IFSelect_RetDone)) {
      throw new Error('STEP non leggibile')
    }
    reader.TransferRoots(new oc.Message_ProgressRange_1())
    return reader.OneShape()
  } finally {
    try { oc.FS.unlink(name) } catch { /* best effort */ }
  }
}

/** Classifica una faccia: tipo superficie + raggio/normale esatti. */
export function faceInfo(oc: OC, face: TopoDS_Face, index: number): FaceInfo {
  const s = new oc.BRepAdaptor_Surface_2(face, true)
  const t = enumVal(s.GetType())
  const info: FaceInfo = { index, surfaceType: t, surfaceLabel: SURFACE_TYPES[t] ?? `#${t}` }
  if (t === 1) info.radius = s.Cylinder().Radius()
  else if (t === 3) info.radius = s.Sphere().Radius()
  else if (t === 2) info.coneSemiAngleDeg = (s.Cone().SemiAngle() * 180) / Math.PI
  else if (t === 0) {
    const d = s.Plane().Axis().Direction()
    info.planeNormal = [d.X(), d.Y(), d.Z()]
  }
  return info
}

/** Volume esatto (mm³) del solido. */
export function volume(oc: OC, shape: TopoDS_Shape): number {
  const props = new oc.GProp_GProps_1()
  oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false)
  return props.Mass()
}

/** Ingombro esatto (bounding box, mm). */
export function boundingBox(oc: OC, shape: TopoDS_Shape): BBox {
  const b = new oc.Bnd_Box_1()
  oc.BRepBndLib.Add(shape, b, false)
  const lo = b.CornerMin(), hi = b.CornerMax()
  return { x: hi.X() - lo.X(), y: hi.Y() - lo.Y(), z: hi.Z() - lo.Z() }
}

/** Distanza minima esatta tra due sotto-shape (facce, spigoli, vertici).
 *  Con due facce parallele = spessore; con due entità qualsiasi = quota. */
export function minDistance(oc: OC, a: TopoDS_Shape, b: TopoDS_Shape): number {
  const d = new oc.BRepExtrema_DistShapeShape_1()
  d.LoadS1(a); d.LoadS2(b)
  d.Perform(new oc.Message_ProgressRange_1())
  return d.Value()
}

/** Angolo (gradi) tra le normali di due facce piane. */
export function angleBetweenPlanes(oc: OC, n1: [number, number, number], n2: [number, number, number]): number {
  const a = new oc.gp_Dir_4(n1[0], n1[1], n1[2])
  const b = new oc.gp_Dir_4(n2[0], n2[1], n2[2])
  return (a.Angle(b) * 180) / Math.PI
}

/** Tassella lo shape per il display three.js, mantenendo la mappa
 *  triangolo→faccia CAD (per selezionare la faccia vera con un clic). */
export function tessellate(oc: OC, shape: TopoDS_Shape, linearDeflection = 0.1, angularDeflection = 0.5): TessellationData {
  new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, angularDeflection, false)
  const positions: number[] = []
  const indices: number[] = []
  const triangleFace: number[] = []
  const faces = explodeFaces(oc, shape)
  // Poly_MeshPurpose_NONE = 0 (ABI OCCT). Il tipo enum non è esportato: ricavo
  // il tipo del 3° parametro dalla firma del metodo e ci casto lo 0.
  const purpose = 0 as unknown as Parameters<typeof oc.BRep_Tool.Triangulation>[2]
  let vBase = 0
  faces.forEach((face, fi) => {
    const loc = new oc.TopLoc_Location_1()
    const handle = oc.BRep_Tool.Triangulation(face, loc, purpose)
    if (handle.IsNull()) return
    const tri = handle.get()
    const trsf = loc.Transformation()
    const nb = tri.NbNodes()
    for (let i = 1; i <= nb; i++) {
      const p = tri.Node(i).Transformed(trsf)
      positions.push(p.X(), p.Y(), p.Z())
    }
    const nt = tri.NbTriangles()
    for (let i = 1; i <= nt; i++) {
      const tt = tri.Triangle(i)
      indices.push(vBase + tt.Value(1) - 1, vBase + tt.Value(2) - 1, vBase + tt.Value(3) - 1)
      triangleFace.push(fi)
    }
    vBase += nb
  })
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    triangleFace: new Uint32Array(triangleFace),
  }
}

// hash deboluccio ma sufficiente a dare un nome file univoco nella FS virtuale.
function hashBuf(buf: ArrayBuffer): number {
  const v = new Uint8Array(buf)
  let h = 2166136261
  const step = Math.max(1, Math.floor(v.length / 4096))
  for (let i = 0; i < v.length; i += step) { h ^= v[i]; h = Math.imul(h, 16777619) }
  return h | 0
}
