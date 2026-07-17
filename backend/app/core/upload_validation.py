"""Validazione contenuto dei file caricati (magic bytes).

Difesa in profondità OLTRE alla whitelist di estensioni: impedisce che un file
con estensione consentita ma contenuto diverso (es. HTML/script rinominato in
.pdf o .dxf) venga accettato e memorizzato. Si valida solo l'inizio del file
(head), passato dagli endpoint di upload prima di scrivere su disco.

Filosofia: rifiutare solo ciò che è palesemente incoerente. Estensioni non
mappate qui → accettate (decide la whitelist a monte), per non rifiutare per
errore formati legittimi.
"""

# Firme binarie: uno dei prefissi deve combaciare con i primi byte.
_MAGIC_PREFIXES = {
    "pdf":  [b"%PDF-"],
    "png":  [b"\x89PNG\r\n\x1a\n"],
    "jpg":  [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "gif":  [b"GIF87a", b"GIF89a"],
    "bmp":  [b"BM"],
    # Office moderno (OOXML) = contenitore ZIP; legacy (OLE2 Compound File).
    "docx": [b"PK\x03\x04"],
    "xlsx": [b"PK\x03\x04"],
    "pptx": [b"PK\x03\x04"],
    "doc":  [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
    "xls":  [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
}


def _looks_like_text(head: bytes) -> bool:
    """True se `head` è plausibilmente testo (DXF/STEP ASCII): niente byte NUL
    e decodificabile come latin-1 (superset di ASCII)."""
    if b"\x00" in head:
        return False
    try:
        head.decode("latin-1")
        return True
    except UnicodeDecodeError:
        return False


def content_matches_ext(head: bytes, ext: str) -> bool:
    """Valida i primi byte (`head`) contro l'estensione dichiarata.

    `ext` con o senza punto, case-insensitive (es. '.pdf', 'dxf'). Ritorna True
    se il contenuto è coerente con l'estensione (o se l'estensione non è mappata).
    """
    ext = ext.lower().lstrip(".")
    prefixes = _MAGIC_PREFIXES.get(ext)
    if prefixes is not None:
        return any(head.startswith(p) for p in prefixes)
    if ext in ("step", "stp"):
        # STEP (ISO 10303-21): testo, inizia con l'header ISO-10303-21.
        return _looks_like_text(head) and b"ISO-10303-21" in head[:512]
    if ext == "dxf":
        # DXF ASCII: 'SECTION' compare subito (dopo "0\nSECTION\n2\nHEADER").
        # DXF binario: sentinella "AutoCAD Binary DXF".
        if head.startswith(b"AutoCAD Binary DXF"):
            return True
        return _looks_like_text(head) and b"SECTION" in head[:2048]
    return True  # estensione non mappata: la whitelist a monte ha già deciso
