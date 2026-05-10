"""One-shot DB fixes per legacy schema.

Eseguibili A MANO se serve sistemare un DB legacy che ha colonne con
vincoli NOT NULL non più validi:

- `edm_cut_speeds.material_id`  (refactor Sprint EDM 1.5: chiave passata
  da `material_id` FK a `material_family` slug)
- `drilling_times.material_id`, `diameter_max_mm`, `height_max_mm`,
  `seconds_per_hole`  (refactor Sprint 11: schema redesigned su
  `electrode_diameter_mm` + `speed_mm_per_sec`)

SQLite non supporta `ALTER COLUMN`, quindi serve copy-rename.
**Idempotenti**: controllano via PRAGMA prima di intervenire e ritornano
no-op se le colonne sono già OK.

Storia: queste funzioni vivevano in `app/main.py` ed erano eseguite ad
ogni boot. Sui DB attuali (refactor confermati e applicati) sono no-op
da molto tempo, ma facevano comunque introspect del DB ad ogni avvio.
Spostate qui (audit#X sprint E, 2026-05-10) per non pagare il costo a
runtime — paghi solo quando serve invocarle a mano.

Uso (dalla cartella `backend/`, con venv attivo):

    venv/bin/python -m scripts.one_shot_db_fixes

Su DB sani (post-refactor) stamperà tutti `[skip]` e uscirà subito.
"""
from sqlalchemy import inspect, text

from app.core.database import engine


def fix_legacy_not_null() -> None:
    """Rende nullable `material_id` di `edm_cut_speeds` e `drilling_times`."""
    insp = inspect(engine)
    targets = [
        ('edm_cut_speeds',
         """CREATE TABLE edm_cut_speeds_new (
                id INTEGER PRIMARY KEY,
                material_id INTEGER,
                material_family VARCHAR(50),
                thickness_min_mm FLOAT NOT NULL DEFAULT 0,
                thickness_max_mm FLOAT NOT NULL,
                speed_mm2_min FLOAT NOT NULL,
                pierce_time_s FLOAT,
                notes TEXT
            )""",
         ['id', 'material_id', 'material_family', 'thickness_min_mm',
          'thickness_max_mm', 'speed_mm2_min', 'pierce_time_s', 'notes']),
        ('drilling_times',
         """CREATE TABLE drilling_times_new (
                id INTEGER PRIMARY KEY,
                material_id INTEGER,
                material_family VARCHAR(50),
                diameter_min_mm FLOAT NOT NULL DEFAULT 0,
                diameter_max_mm FLOAT NOT NULL,
                height_min_mm FLOAT NOT NULL DEFAULT 0,
                height_max_mm FLOAT NOT NULL,
                seconds_per_hole FLOAT NOT NULL,
                notes TEXT
            )""",
         ['id', 'material_id', 'material_family', 'diameter_min_mm',
          'diameter_max_mm', 'height_min_mm', 'height_max_mm',
          'seconds_per_hole', 'notes']),
    ]
    for tbl, schema_sql, columns in targets:
        if tbl not in insp.get_table_names():
            print(f'[skip] {tbl}: tabella non esiste')
            continue
        mat_col = next((c for c in insp.get_columns(tbl) if c['name'] == 'material_id'), None)
        if mat_col is None or mat_col['nullable']:
            print(f'[skip] {tbl}.material_id: già nullable o assente')
            continue
        cols = ', '.join(columns)
        with engine.connect() as conn:
            try:
                conn.execute(text(schema_sql))
                conn.execute(text(f"INSERT INTO {tbl}_new ({cols}) SELECT {cols} FROM {tbl}"))
                conn.execute(text(f"DROP TABLE {tbl}"))
                conn.execute(text(f"ALTER TABLE {tbl}_new RENAME TO {tbl}"))
                conn.commit()
                print(f'[fix] {tbl}.material_id reso nullable')
            except Exception as e:
                conn.rollback()
                print(f'[ERR] {tbl}: {e}')


def fix_drilling_times_schema() -> None:
    """Rende nullable le colonne legacy di `drilling_times` (Sprint 11)."""
    insp = inspect(engine)
    if 'drilling_times' not in insp.get_table_names():
        print('[skip] drilling_times: tabella non esiste')
        return
    cols = {c['name']: c for c in insp.get_columns('drilling_times')}
    legacy = ['diameter_max_mm', 'height_max_mm', 'seconds_per_hole']
    needs_rebuild = any(name in cols and not cols[name]['nullable'] for name in legacy)
    if not needs_rebuild:
        print('[skip] drilling_times: colonne legacy già nullable')
        return
    schema_sql = """
        CREATE TABLE drilling_times_new (
            id INTEGER PRIMARY KEY,
            material_id INTEGER,
            material_family VARCHAR(50),
            electrode_diameter_mm FLOAT,
            speed_mm_per_sec FLOAT,
            diameter_min_mm FLOAT,
            diameter_max_mm FLOAT,
            height_min_mm FLOAT,
            height_max_mm FLOAT,
            seconds_per_hole FLOAT,
            notes TEXT
        )
    """
    columns = ['id', 'material_id', 'material_family',
               'electrode_diameter_mm', 'speed_mm_per_sec',
               'diameter_min_mm', 'diameter_max_mm',
               'height_min_mm', 'height_max_mm',
               'seconds_per_hole', 'notes']
    cols_str = ', '.join(columns)
    with engine.connect() as conn:
        try:
            conn.execute(text(schema_sql))
            conn.execute(text(f"INSERT INTO drilling_times_new ({cols_str}) "
                              f"SELECT {cols_str} FROM drilling_times"))
            conn.execute(text("DROP TABLE drilling_times"))
            conn.execute(text("ALTER TABLE drilling_times_new RENAME TO drilling_times"))
            conn.commit()
            print('[fix] drilling_times: colonne legacy rese nullable')
        except Exception as e:
            conn.rollback()
            print(f'[ERR] drilling_times: {e}')


if __name__ == '__main__':
    fix_legacy_not_null()
    fix_drilling_times_schema()
    print('Done.')
