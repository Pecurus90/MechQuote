// src/pages/orders/MaterialsFileView.tsx
import { Upload, Plus, Check, Trash2, ChevronDown, FileSpreadsheet, Info, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------------------
 * Forma grezzo + misure dinamiche.
 *   Prismatico → Largh · Alt · Spess
 *   Tondo      → Ø · Lungh
 *   Tubo       → Ø est · Parete · Lungh
 * ------------------------------------------------------------------------- */
export type Shape = 'prismatico' | 'tondo' | 'tubo'

export const SHAPE_LABEL: Record<Shape, string> = {
  prismatico: 'Prismatico',
  tondo: 'Tondo',
  tubo: 'Tubo',
}

/** Chiavi misura per forma (le misure sono GIÀ il grezzo). `optional`: non
 *  concorre alla validità (es. Ø interno del tondo = pieno se vuoto). */
export const SHAPE_FIELDS: Record<Shape, { key: string; label: string; optional?: boolean }[]> = {
  prismatico: [
    { key: 'width', label: 'Largh' },
    { key: 'height', label: 'Alt' },
    { key: 'thickness', label: 'Spess' },
  ],
  tondo: [
    { key: 'diameter', label: 'Ø' },
    { key: 'length', label: 'Lungh' },
  ],
  tubo: [
    { key: 'outerDiameter', label: 'Ø est' },
    { key: 'wall', label: 'Parete' },
    { key: 'length', label: 'Lungh' },
  ],
}

export interface MaterialOption {
  id: number
  label: string // es. "C45 · 1.0503"
  supplierName: string // fornitore derivato dal catalogo
}

export interface FileRow {
  id: string
  code: string
  description: string
  materialId: number | null // null = non abbinato → riga in rosso
  supplierName?: string // derivato dal materiale scelto
  shape: Shape
  /** Misure grezzo per chiave (vedi SHAPE_FIELDS). Valore vuoto = mancante. */
  dims: Record<string, string>
  qty: string
}

interface Props {
  subtitle?: string
  rows: FileRow[]
  materials: MaterialOption[]
  onPatchRow: (id: string, patch: Partial<Omit<FileRow, 'id'>>) => void
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onImport: (file: File) => void
  onCreate: () => void
  onPickMaterial: (id: string, materialId: number) => void
}

const GRID =
  'grid grid-cols-[150px_minmax(150px,1.2fr)_minmax(130px,0.8fr)_110px_110px_190px_52px_32px] items-center gap-2.5'

/** Una riga con misure mancanti o materiale non abbinato è "invalida". */
function isRowInvalid(row: FileRow): boolean {
  const unmatched = row.materialId == null
  const missingDims = SHAPE_FIELDS[row.shape].some((f) => !f.optional && !row.dims[f.key]?.trim())
  return unmatched || missingDims
}

export function MaterialsFileView({
  subtitle = 'Importa una distinta o inserisci a mano · crea ordini per fornitore senza legame ai preventivi',
  rows,
  materials,
  onPatchRow,
  onAddRow,
  onRemoveRow,
  onImport,
  onCreate,
  onPickMaterial,
}: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[26px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* StandardPage header + azioni */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <FileSpreadsheet className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Materiale da file</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-none gap-2.5">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-card px-[15px] text-sm font-semibold text-foreground transition-[filter] hover:brightness-105">
            <Upload className="h-4 w-4" />
            Importa CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            onClick={onAddRow}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-card px-[15px] text-sm font-semibold text-foreground transition-[filter] hover:brightness-105"
          >
            <Plus className="h-4 w-4" />
            Aggiungi riga
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={rows.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-105 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Crea ordine
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center rounded-[14px] border border-dashed border-border px-6 py-[52px] text-center">
          <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
            <FilePlus2 className="h-[26px] w-[26px]" />
          </div>
          <div className="mb-[5px] text-[15px] font-semibold text-foreground">Nessuna riga</div>
          <p className="mb-[18px] max-w-[360px] text-[13px] text-muted-foreground">
            Importa una distinta CSV o aggiungi le righe a mano per iniziare a comporre l’ordine.
          </p>
          <div className="flex gap-2.5">
            <label className="inline-flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[9px] border border-border bg-card px-[15px] text-[13px] font-semibold text-foreground transition-[filter] hover:brightness-105">
              <Upload className="h-[15px] w-[15px]" />
              Importa CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onImport(f)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              onClick={onAddRow}
              className="inline-flex h-[38px] items-center gap-[7px] rounded-[9px] bg-primary px-[15px] text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
            >
              <Plus className="h-[15px] w-[15px]" />
              Aggiungi riga
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Editable table */}
          <div className="overflow-hidden rounded-[14px] border border-border">
            <div
              className={cn(
                GRID,
                'border-b border-border bg-card-muted px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground',
              )}
            >
              <div>Codice</div>
              <div>Descrizione</div>
              <div>Materiale</div>
              <div>Fornitore</div>
              <div>Forma</div>
              <div>Misure grezzo</div>
              <div className="text-right">Qtà</div>
              <div />
            </div>

            {rows.map((row, i) => {
              const invalid = isRowInvalid(row)
              const unmatched = row.materialId == null
              const last = i === rows.length - 1
              return (
                <div
                  key={row.id}
                  className={cn(
                    GRID,
                    'px-4 py-[11px]',
                    !last && 'border-b border-border',
                    invalid && 'bg-danger/[0.06]',
                  )}
                >
                  {/* Codice */}
                  <input
                    value={row.code}
                    onChange={(e) => onPatchRow(row.id, { code: e.target.value })}
                    className="h-[34px] w-full rounded-[8px] border border-input bg-background px-2.5 font-mono text-[12.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                  />
                  {/* Descrizione */}
                  <input
                    value={row.description}
                    onChange={(e) => onPatchRow(row.id, { description: e.target.value })}
                    className="h-[34px] w-full rounded-[8px] border border-input bg-background px-2.5 text-[12.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                  />
                  {/* Materiale (select catalogo) */}
                  <div className="relative">
                    <select
                      value={row.materialId ?? ''}
                      onChange={(e) => onPickMaterial(row.id, Number(e.target.value))}
                      className={cn(
                        'h-[34px] w-full cursor-pointer appearance-none rounded-[8px] border bg-background pl-2.5 pr-[26px] text-[12.5px] outline-none focus:ring-2 focus:ring-ring/[0.18]',
                        unmatched
                          ? 'border-danger/60 font-semibold text-danger'
                          : 'border-input text-foreground focus:border-ring',
                      )}
                    >
                      <option value="" disabled>
                        — Non abbinato —
                      </option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className={cn(
                        'pointer-events-none absolute right-[9px] top-[10px] h-[14px] w-[14px]',
                        unmatched ? 'text-danger' : 'text-muted-foreground',
                      )}
                    />
                  </div>
                  {/* Fornitore (derivato) */}
                  <div className="text-[12.5px] text-muted-foreground">{row.supplierName ?? '—'}</div>
                  {/* Forma */}
                  <div className="relative">
                    <select
                      value={row.shape}
                      onChange={(e) => onPatchRow(row.id, { shape: e.target.value as Shape, dims: {} })}
                      className="h-[34px] w-full cursor-pointer appearance-none rounded-[8px] border border-input bg-background pl-2.5 pr-[26px] text-[12.5px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                    >
                      {(Object.keys(SHAPE_LABEL) as Shape[]).map((s) => (
                        <option key={s} value={s}>
                          {SHAPE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-[9px] top-[10px] h-[14px] w-[14px] text-muted-foreground" />
                  </div>
                  {/* Misure grezzo (dinamiche per forma) — label come placeholder
                      così gli input restano alla stessa altezza delle altre celle. */}
                  <div className="flex gap-1.5">
                    {SHAPE_FIELDS[row.shape].map((f) => {
                      const val = row.dims[f.key] ?? ''
                      const missing = !f.optional && !val.trim()
                      return (
                        <input
                          key={f.key}
                          value={val}
                          placeholder={f.label}
                          onChange={(e) =>
                            onPatchRow(row.id, { dims: { ...row.dims, [f.key]: e.target.value } })
                          }
                          className={cn(
                            'h-[34px] w-[54px] rounded-[8px] border bg-background px-2 text-right font-mono text-[12.5px] text-foreground outline-none transition-colors placeholder:text-[11px] placeholder:font-sans placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/[0.18]',
                            missing ? 'border-danger/60' : 'border-input',
                          )}
                        />
                      )
                    })}
                  </div>
                  {/* Qtà */}
                  <input
                    value={row.qty}
                    onChange={(e) => onPatchRow(row.id, { qty: e.target.value })}
                    className="h-[34px] w-full rounded-[8px] border border-input bg-background px-2 text-right font-mono text-[12.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                  />
                  {/* Elimina */}
                  <div className="flex justify-center">
                    <Trash2
                      className="h-4 w-4 cursor-pointer text-muted-foreground transition-colors hover:text-danger"
                      onClick={() => onRemoveRow(row.id)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Info className="h-[14px] w-[14px] text-warning" />
            Le misure inserite sono già il grezzo. Righe in rosso: materiale non abbinato o misure mancanti.
          </div>
        </>
      )}
    </div>
  )
}
