"""Test unit del parser DXF — `services/dxf_parser.py`.

Le fixture DXF sono generate in memoria via ezdxf per evitare di committare
file binari (anche se DXF è ASCII): generare a runtime tiene il test
autoesplicativo, e ogni modifica al parser è subito visibile come delta
sui risultati.
"""
from io import BytesIO

import ezdxf

from app.services.dxf_parser import parse_dxf


def _dxf_to_bytes(doc) -> bytes:
    """Serializza un Drawing ezdxf in bytes UTF-8 (parse_dxf richiede bytes)."""
    buf = BytesIO()
    # ezdxf.write su un TextIOWrapper non funziona su BytesIO direttamente:
    # passiamo per StringIO e poi codifichiamo.
    from io import StringIO
    sbuf = StringIO()
    doc.write(sbuf)
    return sbuf.getvalue().encode("utf-8")


def test_parse_closed_rectangle():
    """LWPOLYLINE rettangolare 100×50 chiusa → 1 profilo, length=300, bbox 100×50."""
    doc = ezdxf.new("R2010")
    # Dichiara esplicitamente i mm: ezdxf ≥1.3 imposta $INSUNITS=6 (metri) di
    # default, e il parser convertirebbe ×1000 (corretto per il file, ma non è
    # ciò che il test intende). Il disegno è inteso in millimetri.
    doc.units = ezdxf.units.MM
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [(0, 0), (100, 0), (100, 50), (0, 50)],
        close=True,
    )
    content = _dxf_to_bytes(doc)

    result = parse_dxf(content)

    assert len(result["profiles"]) == 1
    p = result["profiles"][0]
    assert p["closed"] is True
    # Perimetro rettangolo 100×50 = 2×(100+50) = 300mm
    assert p["length_mm"] == 300.0
    assert p["bbox"]["w"] == 100.0
    assert p["bbox"]["h"] == 50.0
    assert result["bbox_global"]["w"] == 100.0
    assert result["bbox_global"]["h"] == 50.0


def test_stitching_endpoints():
    """2 LINE che condividono un endpoint → unione in 1 profilo aperto."""
    doc = ezdxf.new("R2010")
    doc.units = ezdxf.units.MM   # coordinate in mm (vedi nota in test_parse_closed_rectangle)
    msp = doc.modelspace()
    # Due segmenti che si toccano in (50, 0): A=(0,0)-(50,0), B=(50,0)-(50,30)
    msp.add_line((0, 0), (50, 0))
    msp.add_line((50, 0), (50, 30))
    content = _dxf_to_bytes(doc)

    result = parse_dxf(content)

    # Stitching deve unirli: 1 solo profilo, aperto, length = 50 + 30 = 80
    assert len(result["profiles"]) == 1
    p = result["profiles"][0]
    assert p["closed"] is False
    assert p["length_mm"] == 80.0


def test_parse_insert_block_esploso():
    """Geometria dentro un BLOCK richiamato via INSERT → profilo trovato (audit M3).

    Prima dell'esplosione dei blocchi un disegno così risultava "vuoto".
    """
    doc = ezdxf.new("R2010")
    doc.units = ezdxf.units.MM
    blk = doc.blocks.new(name="RECT")
    blk.add_lwpolyline([(0, 0), (100, 0), (100, 50), (0, 50)], close=True)
    doc.modelspace().add_blockref("RECT", insert=(10, 20))
    content = _dxf_to_bytes(doc)

    result = parse_dxf(content)

    assert len(result["profiles"]) == 1
    p = result["profiles"][0]
    assert p["closed"] is True
    assert p["length_mm"] == 300.0        # perimetro 2×(100+50)
    assert result["bbox_global"]["w"] == 100.0
    assert result["bbox_global"]["h"] == 50.0


def test_parse_insert_annidato():
    """INSERT dentro un blocco a sua volta inserito → esploso ricorsivamente."""
    doc = ezdxf.new("R2010")
    doc.units = ezdxf.units.MM
    inner = doc.blocks.new(name="INNER")
    inner.add_lwpolyline([(0, 0), (20, 0), (20, 20), (0, 20)], close=True)
    outer = doc.blocks.new(name="OUTER")
    outer.add_blockref("INNER", insert=(0, 0))
    doc.modelspace().add_blockref("OUTER", insert=(5, 5))
    content = _dxf_to_bytes(doc)

    result = parse_dxf(content)

    assert len(result["profiles"]) == 1
    assert result["profiles"][0]["length_mm"] == 80.0   # 4×20
