"""Test della validazione contenuto upload (magic bytes)."""
from app.core.upload_validation import content_matches_ext


def test_pdf_valido_e_finto():
    assert content_matches_ext(b"%PDF-1.7\n...", "pdf") is True
    assert content_matches_ext(b"%PDF-1.7\n...", ".pdf") is True   # con o senza punto
    # HTML/script rinominato .pdf -> rifiutato
    assert content_matches_ext(b"<html><script>alert(1)</script>", "pdf") is False


def test_dxf_ascii_e_finto():
    dxf = b"0\r\nSECTION\r\n2\r\nHEADER\r\n"
    assert content_matches_ext(dxf, "dxf") is True
    assert content_matches_ext(b"AutoCAD Binary DXF\r\n\x00", "dxf") is True  # binario
    # HTML mascherato da .dxf -> niente 'SECTION' -> rifiutato
    assert content_matches_ext(b"<html>not a drawing</html>", "dxf") is False


def test_step():
    assert content_matches_ext(b"ISO-10303-21;\nHEADER;\n", "stp") is True
    assert content_matches_ext(b"ISO-10303-21;\n", "step") is True
    assert content_matches_ext(b"just some text", "stp") is False


def test_immagini_e_office():
    assert content_matches_ext(b"\x89PNG\r\n\x1a\n....", "png") is True
    assert content_matches_ext(b"\xff\xd8\xff\xe0", "jpg") is True
    assert content_matches_ext(b"PK\x03\x04....", "docx") is True
    assert content_matches_ext(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "xls") is True
    # png con firma sbagliata
    assert content_matches_ext(b"not-a-png", "png") is False


def test_estensione_non_mappata_permissiva():
    # ext non gestita esplicitamente: la whitelist a monte decide -> accetta
    assert content_matches_ext(b"qualsiasi cosa", "csv") is True
