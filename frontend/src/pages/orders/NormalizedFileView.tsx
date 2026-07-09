// src/pages/orders/NormalizedFileView.tsx
// Gemello di MaterialsFileView per i componenti NORMALIZZATI: niente forma/
// misure grezzo. Cuore = normalizzazione dell'articolo (designazione grezza ->
// tipo di catalogo NormalizedItem); la spec specifica resta in descrizione.
import { useState } from 'react'
import { Upload, Plus, Trash2, ChevronDown, Bolt, Info, FilePlus2, AlertTriangle, Link2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Tipo normalizzato selezionabile (voce di catalogo NormalizedItem). */
export interface TypeOption {
  id: number
  label: string        // es. "Viti TCEI" (description del catalogo)
  supplierName: string
}

/** Riga della tabella editabile normalizzati. */
export interface NormRow {
  id: string
  reference: string    // commessa / num. parte
  description: string  // spec grezza dalla distinta (editabile)
  typeId: number | null
  supplierName?: string
  qty: string
}

/** Alias appreso: designazione grezza -> voce normalizzata. */
export interface NormAliasEntry { id: number; csv_name: string; item_code: string }

interface Props {
  subtitle?: string
  rows: NormRow[]
  types: TypeOption[]
  onPatchRow: (id: string, patch: Partial<Omit<NormRow, 'id'>>) => void
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onImport: (file: File) => void
  onCreate: () => void
  onPickType: (id: string, typeId: number) => void
  aliases?: NormAliasEntry[]
  onDeleteAlias?: (id: number) => void
}

const GRID =
  'grid grid-cols-[140px_minmax(170px,1.3fr)_minmax(150px,1fr)_minmax(130px,0.9fr)_84px_32px] items-center gap-2.5'

/** Riga invalida: tipo non abbinato o descrizione vuota. */
function isRowInvalid(r: NormRow): boolean {
  return r.typeId == null || !r.description.trim()
}

export function NormalizedFileView({
  subtitle = 'Importa una distinta o inserisci a mano · l\'articolo viene normalizzato al tipo, la spec resta in descrizione',
  rows,
  types,
  onPatchRow,
  onAddRow,
  onRemoveRow,
  onImport,
  onCreate,
  onPickType,
  aliases = [],
  onDeleteAlias,
}: Props) {
  const invalidCount = rows.filter(isRowInvalid).length
  const [aliasesOpen, setAliasesOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[26px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Header + azioni */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <Bolt className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Normalizzati da file</h1>
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }}
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
            disabled={rows.length === 0 || invalidCount > 0}
            title={invalidCount > 0 ? `${invalidCount} righe da completare` : undefined}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FilePlus2 className="h-4 w-4" />
            Crea ordine
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-[14px] border border-dashed border-border px-6 py-[52px] text-center">
          <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
            <FileSpreadsheetIcon />
          </div>
          <div className="mb-[5px] text-[15px] font-semibold text-foreground">Nessuna riga</div>
          <p className="mb-[18px] max-w-[380px] text-[13px] text-muted-foreground">
            Importa una distinta CSV o aggiungi le righe a mano per comporre l'ordine dei normalizzati.
          </p>
        </div>
      ) : (
        <>
          {invalidCount > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-danger/30 bg-danger/[0.06] px-3.5 py-2.5 text-[12.5px] font-medium text-danger">
              <AlertTriangle className="h-4 w-4 flex-none" />
              {invalidCount === 1
                ? '1 riga da completare (tipo non abbinato o descrizione mancante) prima di creare l\'ordine.'
                : `${invalidCount} righe da completare (tipo o descrizione mancanti) prima di creare l\'ordine.`}
            </div>
          )}
          <div className="overflow-hidden rounded-[14px] border border-border">
            <div className={cn(GRID, 'border-b border-border bg-card-muted px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground')}>
              <div>Riferimento</div>
              <div>Descrizione (spec)</div>
              <div>Tipo normalizzato</div>
              <div>Fornitore</div>
              <div className="text-right">Q.tà</div>
              <div />
            </div>

            {rows.map((row, i) => {
              const invalid = isRowInvalid(row)
              const unmatched = row.typeId == null
              const last = i === rows.length - 1
              return (
                <div key={row.id} className={cn(GRID, 'px-4 py-[11px]', !last && 'border-b border-border', invalid && 'bg-danger/[0.06]')}>
                  <input
                    value={row.reference}
                    onChange={(e) => onPatchRow(row.id, { reference: e.target.value })}
                    className="h-[34px] w-full rounded-[8px] border border-input bg-background px-2.5 font-mono text-[12.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                  />
                  <input
                    value={row.description}
                    onChange={(e) => onPatchRow(row.id, { description: e.target.value })}
                    className="h-[34px] w-full rounded-[8px] border border-input bg-background px-2.5 text-[12.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                  />
                  <div className="relative">
                    <select
                      value={row.typeId ?? ''}
                      onChange={(e) => onPickType(row.id, Number(e.target.value))}
                      className={cn(
                        'h-[34px] w-full cursor-pointer appearance-none rounded-[8px] border bg-background pl-2.5 pr-[26px] text-[12.5px] outline-none focus:ring-2 focus:ring-ring/[0.18]',
                        unmatched ? 'border-danger/60 font-semibold text-danger' : 'border-input text-foreground focus:border-ring',
                      )}
                    >
                      <option value="" disabled>— Non abbinato —</option>
                      {types.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                    </select>
                    <ChevronDown className={cn('pointer-events-none absolute right-[9px] top-[10px] h-[14px] w-[14px]', unmatched ? 'text-danger' : 'text-muted-foreground')} />
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">{row.supplierName ?? '—'}</div>
                  <input
                    value={row.qty}
                    onChange={(e) => onPatchRow(row.id, { qty: e.target.value })}
                    className="h-[34px] w-full rounded-[8px] border border-input bg-background px-2 text-right font-mono text-[12.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
                  />
                  <div className="flex justify-center">
                    <Trash2 className="h-4 w-4 cursor-pointer text-muted-foreground transition-colors hover:text-danger" onClick={() => onRemoveRow(row.id)} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Info className="h-[14px] w-[14px] text-warning" />
            L'articolo si normalizza al tipo di catalogo; la descrizione porta la spec. Righe in rosso: tipo non abbinato o descrizione mancante.
          </div>
        </>
      )}

      {/* Alias appresi */}
      {onDeleteAlias && aliases.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-[12px] border border-border">
          <button type="button" onClick={() => setAliasesOpen((v) => !v)} className="flex w-full items-center justify-between bg-card-muted px-4 py-3 text-left transition-colors hover:bg-muted">
            <div className="flex items-center gap-2.5">
              <Link2 className="h-[17px] w-[17px] text-muted-foreground" />
              <span className="text-[13.5px] font-semibold text-foreground">Alias normalizzati appresi</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{aliases.length}</span>
            </div>
            <ChevronDown className={cn('h-[17px] w-[17px] text-muted-foreground transition-transform', !aliasesOpen && '-rotate-90')} />
          </button>
          {aliasesOpen && (
            <div className="divide-y divide-border">
              {aliases.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={a.csv_name}>{a.csv_name}</span>
                  <ArrowRight className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={a.item_code}>{a.item_code}</span>
                  <Trash2 className="h-4 w-4 flex-none cursor-pointer text-muted-foreground transition-colors hover:text-danger" onClick={() => onDeleteAlias(a.id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Icona empty-state (evita import extra sopra).
function FileSpreadsheetIcon() {
  return <FilePlus2 className="h-[26px] w-[26px]" />
}
