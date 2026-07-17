"""DXF parser per Wire EDM.

Estrae profili (insieme di entità connesse) da un file DXF, calcola lunghezze,
bounding box, e genera path SVG per il rendering nel viewer.

L'analisi è in-memory: l'endpoint /api/dxf/analyze riceve il file e restituisce
i profili. Lo Step 3 (wizard "Nuovo Preventivo 2D") consumerà il risultato
per popolare i campi della fase Wire EDM.
"""

from io import BytesIO
from typing import List, Tuple, Dict, Optional
import math
import logging

from ezdxf import recover
from ezdxf.math import Vec3, Matrix44
from ezdxf.path import make_path, Path

logger = logging.getLogger(__name__)

# Entità DXF supportate. Tutto il resto viene saltato e segnalato in warnings.
# (TEXT, MTEXT, DIMENSION, HATCH solido sono decorativi/annotazioni.) I BLOCK
# richiamati via INSERT vengono ESPLOSI a monte (_iter_effective_entities): la
# geometria al loro interno ricade quindi in questi tipi supportati.
SUPPORTED_TYPES = {
    'LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'ELLIPSE', 'SPLINE',
}

# Tolleranza di default per matching endpoint (mm).
DEFAULT_TOLERANCE = 0.01

# Tolleranza per flattening curve in SVG (più alta = meno punti, render più rapido).
SVG_FLATTEN_TOL = 0.05

# Tolleranza per flattening curve nel calcolo della lunghezza (più precisa).
LENGTH_FLATTEN_TOL = 0.01

# Hard cap entità nel modelspace. Un DXF "fractal" o malevolo con milioni di
# entità causerebbe freeze CPU e accumulo memoria nel parser. Sopra il cap il
# parsing fallisce esplicitamente. Valore alto rispetto a un disegno tecnico
# normale (un complesso layout non supera ~5000 entità).
MAX_ENTITIES = 50_000

# Conversione $INSUNITS → (fattore × → mm, nome unità).
# Fattori derivati da definizioni standard:
#  - sistema metrico decimale (cm/dm/m)
#  - pollice ISO 1959: 1 in = 25.4 mm esatti
#  - piede = 12 in; mil = 10⁻³ in; microinch = 10⁻⁶ in
# Solo le unità realistiche per un disegno meccanico. Le altre (miglia,
# anni luce, US Survey, ...) → fattore 1.0 + warning "non supportata".
_INSUNITS_TO_MM = {
    0: (1.0,    'unitless'),     # nessuna unità dichiarata → assumi mm
    1: (25.4,   'in'),           # pollici
    2: (304.8,  'ft'),           # piedi (12 in)
    4: (1.0,    'mm'),           # millimetri (no-op)
    5: (10.0,   'cm'),           # centimetri
    6: (1000.0, 'm'),            # metri
    8: (2.54e-5, 'microinch'),   # 10⁻⁶ in
    9: (0.0254, 'mil'),          # 10⁻³ in
    14: (100.0, 'dm'),           # decimetri
}


def _unit_scale_factor(insunits: int) -> Tuple[float, str]:
    """Ritorna (fattore × → mm, nome unità sorgente).
    Codice non in tabella → (1.0, 'unsupported'): il parser lascia le
    coordinate nelle unità del file e segnala warning. Cfr. tabella
    _INSUNITS_TO_MM sopra per la lista delle unità riconosciute.
    """
    return _INSUNITS_TO_MM.get(insunits, (1.0, 'unsupported'))


# Profondità massima di annidamento blocchi (INSERT dentro INSERT) da esplodere.
_MAX_BLOCK_DEPTH = 5


def _iter_effective_entities(entities, depth: int = 0):
    """Scorre le entità esplodendo i blocchi (INSERT) nei loro contenuti in
    coordinate modelspace via `virtual_entities()`, ricorsivamente per i blocchi
    annidati (fino a `_MAX_BLOCK_DEPTH`). Le entità non-INSERT passano invariate.

    Molti DXF meccanici racchiudono il profilo in un BLOCK richiamato via INSERT:
    senza esplosione il disegno risulterebbe "vuoto" (audit M3). `virtual_entities`
    restituisce copie già trasformate in WCS, quindi a valle il pipeline (profili,
    misure, unità) lavora come per le entità di primo livello.
    """
    for e in entities:
        if e.dxftype() == 'INSERT':
            if depth >= _MAX_BLOCK_DEPTH:
                continue
            try:
                virtual = list(e.virtual_entities())
            except Exception as ex:   # blocco corrotto/non esplodibile: skip
                logger.debug("INSERT explode fallito: %s", ex)
                continue
            yield from _iter_effective_entities(virtual, depth + 1)
        else:
            yield e


# ─── helper geometrici ──────────────────────────────────────────────────────

def _key(x: float, y: float, tol: float) -> Tuple[int, int]:
    """Chiave spaziale per il matching endpoint con tolleranza tol."""
    return (round(x / tol), round(y / tol))


def _path_length(p: Path) -> float:
    pts = list(p.flattening(LENGTH_FLATTEN_TOL))
    total = 0.0
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        total += ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) ** 0.5
    return total


def _path_to_svg(p: Path) -> str:
    """Converte un Path in stringa SVG `d`. Usa polyline approssimata."""
    pts = list(p.flattening(SVG_FLATTEN_TOL))
    if not pts:
        return ''
    parts = [f'M {pts[0].x:.3f},{pts[0].y:.3f}']
    for q in pts[1:]:
        parts.append(f'L {q.x:.3f},{q.y:.3f}')
    return ' '.join(parts)


def _path_bbox(p: Path) -> Optional[Tuple[float, float, float, float]]:
    """Ritorna (minx, miny, maxx, maxy) o None se vuoto/non finito.

    Filtra NaN/Inf: ezdxf può ritornare bbox con coordinate non finite su DXF
    corrotti specifici (es. spline malformata). Senza il filtro, il bbox
    globale diventa inf/nan e il viewer SVG renderizza una `viewBox` non
    valida, mostrando il canvas vuoto senza errore.
    """
    b = p.bbox()
    if not b.has_data:
        return None
    coords = (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)
    if not all(math.isfinite(c) for c in coords):
        return None
    return coords


def _close(a: Vec3, b: Vec3, tol: float) -> bool:
    return abs(a.x - b.x) <= tol and abs(a.y - b.y) <= tol


# ─── stitching ──────────────────────────────────────────────────────────────

class _UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _make_profile(profile_id: int, paths: List[Path], closed: bool) -> Dict:
    """Aggrega N path in un singolo profilo. Lunghezza, bbox, svg sommati."""
    total_length = sum(_path_length(p) for p in paths)
    # bbox unione
    minx = miny = float('inf')
    maxx = maxy = float('-inf')
    for p in paths:
        b = _path_bbox(p)
        if b is None:
            continue
        minx = min(minx, b[0]); miny = min(miny, b[1])
        maxx = max(maxx, b[2]); maxy = max(maxy, b[3])
    if minx == float('inf'):
        bbox = {'x': 0.0, 'y': 0.0, 'w': 0.0, 'h': 0.0}
    else:
        bbox = {'x': round(minx, 3), 'y': round(miny, 3),
                'w': round(maxx - minx, 3), 'h': round(maxy - miny, 3)}
    svg = ' '.join(filter(None, (_path_to_svg(p) for p in paths)))
    point_count = sum(len(list(p.flattening(SVG_FLATTEN_TOL))) for p in paths)
    return {
        'id': profile_id,
        'closed': closed,
        'length_mm': round(total_length, 3),
        'bbox': bbox,
        'svg_path': svg,
        'point_count': point_count,
    }


def _stitch(paths: List[Path], tol: float) -> List[Dict]:
    """Raggruppa Path in profili usando union-find sugli endpoint condivisi.

    Un profilo è "closed" se ogni endpoint del gruppo è condiviso da esattamente
    2 path (il gruppo forma uno o più cicli senza lasciare estremi liberi).
    """
    profiles: List[Dict] = []
    next_id = 1

    # 1. path già chiusi (CIRCLE, polyline closed, ecc.) → profilo standalone
    open_paths: List[Path] = []
    for p in paths:
        if p.is_closed or _close(p.start, p.end, tol):
            profiles.append(_make_profile(next_id, [p], closed=True))
            next_id += 1
        else:
            open_paths.append(p)

    if not open_paths:
        return profiles

    # 2. union-find su endpoint per raggruppare gli aperti
    n = len(open_paths)
    uf = _UnionFind(n)
    ep_to_idx: Dict[Tuple[int, int], List[int]] = {}
    for i, p in enumerate(open_paths):
        for pt in (p.start, p.end):
            k = _key(pt.x, pt.y, tol)
            ep_to_idx.setdefault(k, []).append(i)
    for ids in ep_to_idx.values():
        for j in range(1, len(ids)):
            uf.union(ids[0], ids[j])

    # 3. raggruppa per root e classifica chiuso/aperto
    groups: Dict[int, List[int]] = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)

    for indices in groups.values():
        group_paths = [open_paths[i] for i in indices]
        # closed se ogni endpoint nel gruppo è usato esattamente 2 volte
        ep_count: Dict[Tuple[int, int], int] = {}
        for p in group_paths:
            for pt in (p.start, p.end):
                k = _key(pt.x, pt.y, tol)
                ep_count[k] = ep_count.get(k, 0) + 1
        closed = bool(ep_count) and all(c == 2 for c in ep_count.values())
        profiles.append(_make_profile(next_id, group_paths, closed=closed))
        next_id += 1

    return profiles


# ─── entry point ────────────────────────────────────────────────────────────

def _measure_primitives(msp, factor: float) -> Tuple[List[Dict], List[Dict]]:
    """Estrae, dalle entità DXF, le primitive per gli STRUMENTI DI MISURA del
    viewer: punti di snap (estremi linee, vertici polilinee, centri, estremi
    archi) e cerchi (centro + raggio esatti, per il diametro). Coordinate
    scalate in mm come i profili (× factor). Best-effort: entità non gestite
    saltate. Serve il dato ESATTO delle entità, non l'appiattimento SVG."""
    raw_pts: List[Tuple[float, float]] = []
    circles: List[Dict] = []

    def sc(x: float, y: float) -> Tuple[float, float]:
        # float() esplicito: ezdxf/numpy possono restituire np.float64.
        return (round(float(x) * factor, 3), round(float(y) * factor, 3))

    for e in _iter_effective_entities(msp):
        try:
            t = e.dxftype()
            if t == 'LINE':
                raw_pts.append(sc(e.dxf.start.x, e.dxf.start.y))
                raw_pts.append(sc(e.dxf.end.x, e.dxf.end.y))
            elif t == 'CIRCLE':
                cx, cy = sc(e.dxf.center.x, e.dxf.center.y)
                raw_pts.append((cx, cy))
                circles.append({'x': cx, 'y': cy, 'r': round(float(e.dxf.radius) * factor, 3), 'full': True})
            elif t == 'ARC':
                c, r = e.dxf.center, e.dxf.radius
                cx, cy = sc(c.x, c.y)
                raw_pts.append((cx, cy))
                for ang in (e.dxf.start_angle, e.dxf.end_angle):
                    a = math.radians(ang)
                    raw_pts.append(sc(c.x + r * math.cos(a), c.y + r * math.sin(a)))
                circles.append({'x': cx, 'y': cy, 'r': round(float(r) * factor, 3), 'full': False})
            elif t == 'LWPOLYLINE':
                for x, y, *_ in e.get_points('xy'):
                    raw_pts.append(sc(x, y))
            elif t == 'POLYLINE':
                for v in e.vertices:
                    loc = v.dxf.location
                    raw_pts.append(sc(loc.x, loc.y))
            elif t == 'ELLIPSE':
                raw_pts.append(sc(e.dxf.center.x, e.dxf.center.y))
        except Exception as ex:
            logger.debug("measure primitive skip %s: %s", e.dxftype(), ex)
            continue

    # dedup punti (tolleranza 0.01 mm)
    seen = set()
    snap_points: List[Dict] = []
    for x, y in raw_pts:
        k = (round(x * 100), round(y * 100))
        if k not in seen:
            seen.add(k)
            snap_points.append({'x': x, 'y': y})
    return snap_points, circles


def _entities(msp, factor: float) -> List[Dict]:
    """Estrae le ENTITÀ geometriche vere per il viewer (rendering + hover +
    misura per-entità), non l'appiattimento SVG. Coordinate scalate in mm.

    - LINE/CIRCLE/ARC → entità esatte (line/circle/arc).
    - LWPOLYLINE/POLYLINE → esplose nei loro segmenti (line/arc, i bulge
      diventano archi veri) via `virtual_entities()`.
    - ELLIPSE/SPLINE → polilinea appiattita (poly), non hanno primitiva semplice.
    """
    out: List[Dict] = []

    def s(v: float) -> float:
        return round(float(v) * factor, 4)

    def emit_line(a, b) -> None:
        out.append({'t': 'line', 'x1': s(a.x), 'y1': s(a.y), 'x2': s(b.x), 'y2': s(b.y)})

    def emit_circle(c, r) -> None:
        out.append({'t': 'circle', 'cx': s(c.x), 'cy': s(c.y), 'r': s(r)})

    def emit_arc(c, r, a0, a1) -> None:
        out.append({'t': 'arc', 'cx': s(c.x), 'cy': s(c.y), 'r': s(r),
                    'a0': round(float(a0), 4), 'a1': round(float(a1), 4)})

    def emit_poly(entity) -> None:
        # Fallback affidabile: appiattisce l'entità come fanno i profili
        # (stesso make_path). Garantisce che l'entità sia comunque renderizzabile
        # anche se l'estrazione esatta (sopra) non ha prodotto nulla.
        try:
            pts = [[s(p.x), s(p.y)] for p in make_path(entity).flattening(SVG_FLATTEN_TOL)]
        except Exception as ex:
            logger.debug("entity flatten fallback failed %s: %s", entity.dxftype(), ex)
            return
        if len(pts) >= 2:
            out.append({'t': 'poly', 'pts': pts, 'closed': False})

    for e in _iter_effective_entities(msp):
        t = e.dxftype()
        if t not in SUPPORTED_TYPES:
            continue
        before = len(out)
        try:
            if t == 'LINE':
                emit_line(e.dxf.start, e.dxf.end)
            elif t == 'CIRCLE':
                emit_circle(e.dxf.center, e.dxf.radius)
            elif t == 'ARC':
                emit_arc(e.dxf.center, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle)
            elif t in ('LWPOLYLINE', 'POLYLINE'):
                for ve in e.virtual_entities():
                    vt = ve.dxftype()
                    if vt == 'LINE':
                        emit_line(ve.dxf.start, ve.dxf.end)
                    elif vt == 'ARC':
                        emit_arc(ve.dxf.center, ve.dxf.radius, ve.dxf.start_angle, ve.dxf.end_angle)
        except Exception as ex:
            logger.debug("entity exact extract failed %s: %s", t, ex)
        # Se l'estrazione esatta non ha aggiunto nulla per questa entità
        # (tipo non gestito sopra, o eccezione), ripiega sull'appiattimento.
        if len(out) == before:
            emit_poly(e)
    return out


def parse_dxf(content: bytes, tolerance: float = DEFAULT_TOLERANCE) -> Dict:
    """Analizza un file DXF in bytes e ritorna il dict pronto per DxfAnalysisOut.

    Raises:
        ValueError: file non valido o non leggibile come DXF.
    """
    warnings: List[str] = []
    try:
        doc, auditor = recover.read(BytesIO(content))
    except Exception as e:
        raise ValueError(f"DXF non valido o corrotto: {e}")

    if auditor.has_errors:
        warnings.append(f"DXF con {len(auditor.errors)} errori (recuperati automaticamente)")

    msp = doc.modelspace()
    paths: List[Path] = []
    skipped: Dict[str, int] = {}

    seen_entities = 0
    for entity in _iter_effective_entities(msp):
        seen_entities += 1
        if seen_entities > MAX_ENTITIES:
            raise ValueError(
                f"DXF troppo complesso: oltre {MAX_ENTITIES} entità nel modelspace. "
                f"Semplifica il disegno o segmenta in più file."
            )
        dtype = entity.dxftype()
        if dtype not in SUPPORTED_TYPES:
            skipped[dtype] = skipped.get(dtype, 0) + 1
            continue
        try:
            p = make_path(entity)
            if len(p) > 0:
                paths.append(p)
        except Exception as e:
            logger.warning("DXF entity %s skipped: %s", dtype, e)
            skipped[dtype] = skipped.get(dtype, 0) + 1

    if skipped:
        skipped_summary = ', '.join(f'{k}×{v}' for k, v in skipped.items())
        warnings.append(f"Entità ignorate: {skipped_summary}")

    # C5 — Conversione unità DXF → mm (una sola volta, in ingresso al pipeline).
    # Dopo questo punto tutto il pipeline (stitching, length, bbox, svg) lavora
    # su Path in mm. La tolleranza di stitching (DEFAULT_TOLERANCE=0.01 mm) è
    # già nelle unità giuste.
    insunits = doc.header.get('$INSUNITS', 0)
    factor, source_units = _unit_scale_factor(insunits)
    if factor != 1.0:
        m = Matrix44.scale(factor)
        paths = [p.transform(m) for p in paths]
        warnings.append(
            f"Disegno DXF in '{source_units}': coordinate convertite × {factor:g} in mm."
        )
    elif source_units == 'unitless':
        warnings.append(
            "DXF senza unità dichiarate ($INSUNITS=0): assunti millimetri. Verificare scala."
        )
    elif source_units == 'unsupported':
        warnings.append(
            f"Unità DXF ($INSUNITS={insunits}) non supportata: coordinate non convertite. Verificare scala."
        )

    profiles = _stitch(paths, tolerance)

    # bbox globale unione
    if profiles:
        gx0 = min(p['bbox']['x'] for p in profiles)
        gy0 = min(p['bbox']['y'] for p in profiles)
        gx1 = max(p['bbox']['x'] + p['bbox']['w'] for p in profiles)
        gy1 = max(p['bbox']['y'] + p['bbox']['h'] for p in profiles)
        bbox_global = {'x': round(gx0, 3), 'y': round(gy0, 3),
                       'w': round(gx1 - gx0, 3), 'h': round(gy1 - gy0, 3)}
    else:
        bbox_global = {'x': 0.0, 'y': 0.0, 'w': 0.0, 'h': 0.0}

    n_closed = sum(1 for p in profiles if p['closed'])
    total_length = round(sum(p['length_mm'] for p in profiles), 3)

    # `units` riflette le unità in cui sono le coordinate restituite (post-C5,
    # sempre 'mm' tranne che per codici $INSUNITS non supportati, dove i valori
    # restano nelle unità del file e il warning sopra lo segnala).
    units = 'mm' if source_units != 'unsupported' else f'code-{insunits}'

    snap_points, circles = _measure_primitives(msp, factor)
    entities = _entities(msp, factor)

    return {
        'profiles': profiles,
        'bbox_global': bbox_global,
        'total_length_mm': total_length,
        'n_closed_profiles': n_closed,
        'suggested_pierce': n_closed,  # 1 pierce per profilo chiuso
        'units': units,
        # Fattore di conversione applicato (raw × factor = mm). Serve al viewer
        # per l'override mm/pollici quando l'header mente sull'unità
        # (es. $INSUNITS=1 pollici ma il disegno è in mm).
        'unit_factor': factor,
        'warnings': warnings,
        # Primitive per gli strumenti di misura del viewer (esatte, non SVG).
        'snap_points': snap_points,
        'circles': circles,
        # Entità geometriche vere (line/circle/arc/poly) per rendering + hover.
        'entities': entities,
    }
