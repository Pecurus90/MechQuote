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
