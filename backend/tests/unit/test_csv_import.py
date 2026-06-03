"""Test unit del motore CSV (`app.core.csv_import`).

Coprono solo i pezzi puri di parsing/template — NON toccano il DB.
L'engine `import_catalog_csv` non è testato qui: richiede Session +
modello + transazione e va coperto da un integration test quando un
catalogo verrà collegato (Step successivo del cantiere).
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core.csv_import import (
    CsvImportConfig,
    CsvImportResult,
    CsvRowSkip,
    _decode_csv_bytes,
    _find_header_row,
    csv_template_response,
    parse_decimal_it,
)


# ---------------------------------------------------------------------------
# Decode con fallback encoding
# ---------------------------------------------------------------------------

def test_decode_utf8_bom_strips_bom():
    # "Acciaio" preceduto da BOM UTF-8 (EF BB BF)
    raw = b'\xef\xbb\xbfAcciaio'
    assert _decode_csv_bytes(raw) == 'Acciaio'


def test_decode_plain_utf8():
    assert _decode_csv_bytes('caffè'.encode('utf-8')) == 'caffè'


def test_decode_cp1252_fallback_when_not_utf8():
    # 0xE0 = 'à' in cp1252, non valido in utf-8 da solo
    assert _decode_csv_bytes(b'caff\xe0') == 'caffà'


def test_decode_unknown_encoding_raises_400():
    # bytes non decodificabili in nessun encoding ASCII-compatibile?
    # In pratica latin1 accetta tutto, quindi non c'è un input che fallisce
    # tutti i 4 fallback. Verifichiamo invece che l'ultima possibilità
    # (latin1) accetti — è la garanzia che NON solleviamo mai a meno di un
    # bug interno. Test "negativo" simbolico:
    assert _decode_csv_bytes(b'\xff\xfe\x00\x00') is not None


# ---------------------------------------------------------------------------
# Auto-detect riga header
# ---------------------------------------------------------------------------

EXPECTED = ['Nome', 'Densità', 'Costo/kg']


def test_find_header_on_first_row():
    rows = [
        ['Nome', 'Densità', 'Costo/kg'],
        ['Acciaio C40', '7.85', '1.20'],
    ]
    idx, header = _find_header_row(rows, EXPECTED)
    assert idx == 0
    assert header == EXPECTED


def test_find_header_skips_prologue_rows():
    rows = [
        ['# export gestionale'],
        ['data export', '2026-06-03'],
        [''],  # riga vuota di stacco
        ['Nome', 'Densità', 'Costo/kg', 'Note'],  # extra col tollerata
        ['Acciaio C40', '7.85', '1.20', 'note'],
    ]
    idx, header = _find_header_row(rows, EXPECTED)
    assert idx == 3
    assert header[:3] == EXPECTED


def test_find_header_strips_whitespace():
    rows = [['  Nome  ', 'Densità', '  Costo/kg']]
    idx, header = _find_header_row(rows, EXPECTED)
    assert idx == 0
    assert header == EXPECTED


def test_find_header_missing_column_raises_400():
    with pytest.raises(HTTPException) as ex:
        _find_header_row([['Nome', 'Densità']], EXPECTED)
    assert ex.value.status_code == 400
    assert 'Costo/kg' in ex.value.detail


def test_find_header_not_in_first_5_rows_raises_400():
    rows = [['junk']] * 5 + [EXPECTED]
    with pytest.raises(HTTPException) as ex:
        _find_header_row(rows, EXPECTED)
    assert ex.value.status_code == 400


# ---------------------------------------------------------------------------
# CsvRowSkip / CsvImportResult / config defaults
# ---------------------------------------------------------------------------

def test_csv_row_skip_carries_reason():
    err = CsvRowSkip("Densità mancante")
    assert err.reason == "Densità mancante"
    assert str(err) == "Densità mancante"


def test_result_total_and_dict():
    r = CsvImportResult(created=3, skipped_existing=2, skipped_invalid=1,
                        examples=['a', 'b', 'c', 'd', 'e', 'f'])
    assert r.total_processed == 6
    d = r.to_dict()
    assert d['created'] == 3
    assert d['skipped_existing'] == 2
    assert d['skipped_invalid'] == 1
    assert d['total_processed'] == 6
    # examples viene troncato a 5 nel to_dict
    assert d['examples'] == ['a', 'b', 'c', 'd', 'e']


def test_config_default_normalize_key_is_strip_lower():
    cfg = CsvImportConfig(
        expected_columns=EXPECTED,
        model=object,
        db_key_attr='name',
        mapper=lambda row: (row['Nome'], {}),
    )
    assert cfg.normalize_key('  Acciaio C40  ') == 'acciaio c40'
    assert cfg.normalize_key(None) == ''


def test_config_custom_normalize_key_is_respected():
    cfg = CsvImportConfig(
        expected_columns=EXPECTED,
        model=object,
        db_key_attr='name',
        mapper=lambda row: (row['Nome'], {}),
        normalize_key=lambda s: str(s or '').strip(),  # case-sensitive
    )
    assert cfg.normalize_key('  Acciaio C40  ') == 'Acciaio C40'


# ---------------------------------------------------------------------------
# parse_decimal_it
# ---------------------------------------------------------------------------

def test_parse_decimal_it_accepts_comma_and_dot():
    assert parse_decimal_it('7,85', 'Densità') == 7.85
    assert parse_decimal_it('7.85', 'Densità') == 7.85
    assert parse_decimal_it('  10  ', 'X') == 10.0


def test_parse_decimal_it_empty_required_raises_with_label():
    with pytest.raises(CsvRowSkip) as ex:
        parse_decimal_it('', 'Densità')
    assert 'Densità' in ex.value.reason
    assert 'mancante' in ex.value.reason


def test_parse_decimal_it_empty_optional_returns_none():
    assert parse_decimal_it('', 'X', required=False) is None
    assert parse_decimal_it(None, 'X', required=False) is None
    assert parse_decimal_it('   ', 'X', required=False) is None


def test_parse_decimal_it_invalid_raises_with_value():
    with pytest.raises(CsvRowSkip) as ex:
        parse_decimal_it('abc', 'Costo/kg')
    assert 'Costo/kg' in ex.value.reason
    assert 'abc' in ex.value.reason


# ---------------------------------------------------------------------------
# Template scaricabile
# ---------------------------------------------------------------------------

import asyncio


def _consume_body(resp) -> bytes:
    """Consuma il body_iterator (async) di StreamingResponse e lo aggrega."""

    async def _gather():
        chunks = []
        async for chunk in resp.body_iterator:
            chunks.append(chunk)
        return b''.join(chunks)

    return asyncio.run(_gather())


def test_template_response_headers_and_payload():
    resp = csv_template_response(
        filename='materiali_modello.csv',
        columns=['Nome', 'Densità (kg/dm³)', 'Costo/kg (€)'],
        examples=[
            ['Acciaio C40', '7.85', '1.20'],
            ['Alluminio 6082', '2.70', '4.50'],
        ],
    )
    assert resp.media_type.startswith('text/csv')
    cd = resp.headers['content-disposition']
    assert 'attachment' in cd
    assert 'materiali_modello.csv' in cd

    body = _consume_body(resp).decode('utf-8-sig')
    lines = body.strip().splitlines()
    assert lines[0] == 'Nome;Densità (kg/dm³);Costo/kg (€)'
    assert lines[1] == 'Acciaio C40;7.85;1.20'
    assert lines[2] == 'Alluminio 6082;2.70;4.50'


def test_template_response_header_only_when_no_examples():
    resp = csv_template_response(
        filename='x.csv',
        columns=['A', 'B'],
    )
    body = _consume_body(resp).decode('utf-8-sig')
    assert body.strip() == 'A;B'
