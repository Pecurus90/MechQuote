// src/pages/orders/BarConsolidationModal.tsx
// TD-3 — al "Crea CSV" propone di consolidare gli spezzoni tondi con stesso
// materiale + diametro in una o più barre. L'utente sceglie quali lunghezze
// includere (le altre restano spezzoni singoli) e compone le barre da ordinare
// (lunghezza × quantità): il sistema mostra fabbisogno vs coperto (avanzo).
import { useState } from 'react'
import { Layers, X, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { BarSpec } from '@/types'

export interface BarCandidateRow {
  lengthMm: number
  qty: number
  refs: string[]
}
export interface BarCandidate {
  key: string
  materialId: number | null
  materialName: string
  diameterMm: number
  rows: BarCandidateRow[]
}

interface Props {
  candidates: BarCandidate[]
  onCancel: () => void
  onConfirm: (bars: BarSpec[]) => void
}

interface PieceInput { length: string; qty: string }
interface CandState {
  enabled: boolean
  included: Set<number>       // lunghezze incluse nella barra
  pieces: PieceInput[]        // barre da ordinare
}

const num = (v: number): string => Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 })
const dec = (s: string): number => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const int = (s: string): number => { const n = parseInt(s, 10); return Number.isFinite(n) && n > 0 ? n : 0 }

export default function BarConsolidationModal({ candidates, onCancel, onConfirm }: Props) {
  useEscapeKey(onCancel, true)
  const [state, setState] = useState<Record<string, CandState>>(() =>
    Object.fromEntries(candidates.map(c => {
      const need0 = c.rows.reduce((s, r) => s + r.lengthMm * r.qty, 0)
      return [c.key, {
        enabled: true,
        included: new Set(c.rows.map(r => r.lengthMm)),
        pieces: [{ length: String(need0), qty: '1' }],
      }]
    })),
  )

  const patch = (key: string, p: Partial<CandState>) =>
    setState(s => ({ ...s, [key]: { ...s[key], ...p } }))

  const toggleLength = (key: string, len: number) =>
    setState(s => {
      const cur = s[key]
      const inc = new Set(cur.included)
      inc.has(len) ? inc.delete(len) : inc.add(len)
      return { ...s, [key]: { ...cur, included: inc } }
    })

  const setPiece = (key: string, idx: number, p: Partial<PieceInput>) =>
    patch(key, { pieces: state[key].pieces.map((pc, i) => i === idx ? { ...pc, ...p } : pc) })
  const addPiece = (key: string) =>
    patch(key, { pieces: [...state[key].pieces, { length: '', qty: '1' }] })
  const removePiece = (key: string, idx: number) =>
    patch(key, { pieces: state[key].pieces.filter((_, i) => i !== idx) })

  const need = (c: BarCandidate, st: CandState): number =>
    c.rows.filter(r => st.included.has(r.lengthMm)).reduce((s, r) => s + r.lengthMm * r.qty, 0)
  const covered = (st: CandState): number =>
    st.pieces.reduce((s, p) => s + dec(p.length) * int(p.qty), 0)

  const confirm = () => {
    const bars: BarSpec[] = []
    for (const c of candidates) {
      const st = state[c.key]
      const lengths = c.rows.filter(r => st.included.has(r.lengthMm)).map(r => r.lengthMm)
      const pieces = st.pieces
        .map(p => ({ length_mm: dec(p.length), quantity: int(p.qty) }))
        .filter(p => p.length_mm > 0 && p.quantity > 0)
      if (!st.enabled || lengths.length === 0 || pieces.length === 0) continue
      bars.push({ material_id: c.materialId, material_name: c.materialName, diameter_mm: c.diameterMm, lengths, pieces })
    }
    onConfirm(bars)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-primary/[0.13] text-primary">
            <Layers className="h-[19px] w-[19px]" />
          </span>
          <div className="flex-1">
            <h2 className="text-[16px] font-bold text-foreground">Raggruppa i tondi in barre</h2>
            <p className="text-[12.5px] text-muted-foreground">
              Spezzoni con stesso materiale e diametro: ordina barre intere invece dei singoli pezzi.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Chiudi" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {candidates.map(c => {
            const st = state[c.key]
            const nd = need(c, st)
            const cov = covered(st)
            const diff = cov - nd
            return (
              <div key={c.key} className={cn('rounded-[12px] border border-border p-3.5', !st.enabled && 'opacity-55')}>
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="text-[13.5px] font-semibold text-foreground">
                    {c.materialName} <span className="font-mono text-muted-foreground">· Ø{num(c.diameterMm)}</span>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                    <input type="checkbox" checked={st.enabled} onChange={e => patch(c.key, { enabled: e.target.checked })} className="h-3.5 w-3.5 accent-primary" />
                    Ordina come barra
                  </label>
                </div>

                {/* Spezzoni: quali includere */}
                <div className="space-y-1">
                  {c.rows.map(r => (
                    <label key={r.lengthMm} className="flex items-center gap-2.5 text-[12.5px]">
                      <input type="checkbox" checked={st.included.has(r.lengthMm)} disabled={!st.enabled} onChange={() => toggleLength(c.key, r.lengthMm)} className="h-3.5 w-3.5 accent-primary" />
                      <span className="font-mono text-foreground">{num(r.lengthMm)} mm × {r.qty}</span>
                      {r.refs.length > 0 && <span className="truncate font-mono text-[11px] text-muted-foreground">{r.refs.join(' ')}</span>}
                    </label>
                  ))}
                </div>

                {/* Barre da ordinare */}
                <div className="mt-3 border-t border-border pt-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Barre da ordinare</span>
                    <button type="button" onClick={() => addPiece(c.key)} disabled={!st.enabled} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary disabled:opacity-40">
                      <Plus className="h-3.5 w-3.5" /> Aggiungi
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {st.pieces.map((pc, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12.5px]">
                        <input type="text" inputMode="decimal" value={pc.length} disabled={!st.enabled} onChange={e => setPiece(c.key, i, { length: e.target.value })} placeholder="lunghezza"
                          className="h-8 w-24 rounded-[7px] border border-input bg-card px-2 font-mono text-foreground outline-none focus:border-ring" />
                        <span className="text-muted-foreground">mm ×</span>
                        <input type="text" inputMode="numeric" value={pc.qty} disabled={!st.enabled} onChange={e => setPiece(c.key, i, { qty: e.target.value })}
                          className="h-8 w-14 rounded-[7px] border border-input bg-card px-2 font-mono text-foreground outline-none focus:border-ring" />
                        <button type="button" onClick={() => removePiece(c.key, i)} disabled={!st.enabled || st.pieces.length <= 1} aria-label="Rimuovi barra"
                          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground hover:text-danger disabled:opacity-30">
                          <Trash2 className="h-[15px] w-[15px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">Fabbisogno <span className="font-mono text-foreground">{num(nd)} mm</span></span>
                    <span className={cn('font-mono font-semibold', diff < 0 ? 'text-danger' : 'text-success')}>
                      Coperto {num(cov)} mm {diff < 0 ? `(mancano ${num(-diff)})` : `(avanzo ${num(diff)})`}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="outline" size="sm" onClick={onCancel}>Annulla</Button>
          <Button size="sm" onClick={confirm}>Crea ordine</Button>
        </div>
      </div>
    </div>
  )
}
