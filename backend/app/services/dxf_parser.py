"""DXF parser per Wire EDM.

Estrae profili (insieme di entità connesse) da un file DXF, calcola lunghezze,
bounding box, e genera path SVG per il rendering nel viewer.

L'analisi è in-memory: l'endpoint /api/dxf/analyze riceve il file e restituisce
i profili. Lo Step 3 (wizard "Nuovo Preventivo 2D") consumerà il risultato
per popolare i campi della fase Wire EDM.
"""

from io import BytesIO
from typing import List, Tuple, Dict, Optional
import logging

from ezdxf import recover
from ezdxf.math import Vec3
from ezdxf.path import make_path, Path

logger = logging.getLogger(__name__)

# Entità DXF supportate. Tutto il resto viene saltato e segnalato in warnings.
# (TEXT, MTEXT, DIMENSION, HATCH solido, BLOCK ref non vengono trasformati in profili
#  tagliabili — sono entità decorative o di annotazione.)
SUPPORTED_TYPES = {
    'LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'ELLIPSE', 'SPLINE',
}

# Tolleranza di default per matching endpoint (mm).
DEFAULT_TOLERANCE = 0.01

# Tolleranza per flattening curve in SVG (più alta = meno punti, render più rapido).
SVG_FLATTEN_TOL = 0.05

# Tolleranza per flattening curve nel calcolo della lunghezza (più precisa).
LENGTH_FLATTEN_TOL = 0.01


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
    """Ritorna (minx, miny, maxx, maxy) o None se vuoto."""
    b = p.bbox()
    if not b.has_data:
        return None
    return b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y


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

    for entity in msp:
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

    # Unità DXF — header $INSUNITS: 0=unitless, 1=inch, 4=mm, ...
    insunits = doc.header.get('$INSUNITS', 0)
    units_map = {0: 'unitless', 1: 'in', 4: 'mm', 5: 'cm', 6: 'm'}
    units = units_map.get(insunits, f'code-{insunits}')
    if units not in ('mm', 'unitless'):
        warnings.append(f"Unità DXF: {units}. I valori NON sono convertiti in mm — verifica scala.")

    return {
        'profiles': profiles,
        'bbox_global': bbox_global,
        'total_length_mm': total_length,
        'n_closed_profiles': n_closed,
        'suggested_pierce': n_closed,  # 1 pierce per profilo chiuso
        'units': units,
        'warnings': warnings,
    }
