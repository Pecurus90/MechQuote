// src/components/quotes/PartCostSummary.tsx
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DecimalField } from '@/components/ui/decimal-field'
import { Label } from '@/components/ui/label'

interface Props {
  // Tutti già calcolati dal container (nessun calcolo qui).
  materialTotal: number
  materialShipping: number
  materialCutting?: number
  laborTotal: number
  laborSetup: number
  laborWork: number
  treatmentTotal: number
  treatmentShipping: number
  costPerPart: number
  unitPrice: number
  /** Quota per pezzo di trasporto+imballaggio ripartita sul preventivo. Sommata
   *  (senza margine) al prezzo/pz mostrato: le spese accessorie vengono
   *  "camuffate" dentro il prezzo, il totale del preventivo resta invariato. */
  managementPerPiece?: number
  quantity: number
  totalPrice: number
  minimumActive?: boolean
  // Editabili
  marginPercent: string
  minimumPrice: string
  locked?: boolean
  /** Commit al blur (parse + salvataggio nel container). */
  onCommit: (field: 'marginPercent' | 'minimumPrice', raw: string) => void
}

const eur2 = (v: number): string =>
  '€ ' +
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function SubRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2.5 pl-2.5 text-[11.5px] text-muted-foreground">
      <span className="min-w-0">{label}</span>
      <span className="flex-none whitespace-nowrap font-mono">{eur2(value)}</span>
    </div>
  )
}

function GroupRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2.5">
      <span className="min-w-0 text-[13px] font-semibold text-foreground">{label}</span>
      <span className="flex-none whitespace-nowrap font-mono text-[13.5px] font-semibold text-foreground">
        {eur2(value)}
      </span>
    </div>
  )
}

export function PartCostSummary(props: Props) {
  const {
    materialTotal,
    materialShipping,
    materialCutting,
    laborTotal,
    laborSetup,
    laborWork,
    treatmentTotal,
    treatmentShipping,
    costPerPart,
    unitPrice,
    managementPerPiece = 0,
    quantity,
    totalPrice,
    minimumActive,
    marginPercent,
    minimumPrice,
    locked,
    onCommit,
  } = props

  return (
    <div className="sticky top-5 rounded-[14px] border border-border bg-card-muted px-[18px] pb-5 pt-[18px]">
      <div className="mb-4 text-[13px] font-bold uppercase tracking-[0.02em] text-muted-foreground">
        Riepilogo costi
      </div>

      {/* materiale */}
      <GroupRow label="Materiale" value={materialTotal} />
      <div className="mb-3 flex flex-col gap-1">
        <SubRow label="di cui spedizione" value={materialShipping} />
        {materialCutting != null && <SubRow label="di cui taglio" value={materialCutting} />}
      </div>

      {/* lavorazioni */}
      <GroupRow label="Lavorazioni" value={laborTotal} />
      <div className="mb-3 flex flex-col gap-1">
        <SubRow label="di cui attrezzaggi" value={laborSetup} />
        <SubRow label="di cui lavorazione" value={laborWork} />
      </div>

      {/* trattamenti */}
      <GroupRow label="Trattamenti" value={treatmentTotal} />
      <div className="mb-3.5 flex flex-col gap-1">
        <SubRow label="di cui spedizione" value={treatmentShipping} />
      </div>

      {/* costo/pz */}
      <div className="mb-4 flex items-center justify-between gap-2.5 border-y border-border py-[11px]">
        <span className="min-w-0 text-[13.5px] font-bold text-foreground">Costo/pz</span>
        <span className="flex-none whitespace-nowrap font-mono text-base font-bold text-foreground">
          {eur2(costPerPart)}
        </span>
      </div>

      {/* editable */}
      <fieldset disabled={locked} className="mb-3.5 flex gap-2.5 disabled:opacity-60">
        <div className="flex-1">
          <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
            Margine %
          </Label>
          <DecimalField
            value={marginPercent}
            onCommit={(raw) => onCommit('marginPercent', raw)}
            className="h-9 rounded-[9px] border-input bg-background font-mono text-[13.5px]"
          />
        </div>
        <div className="flex-1">
          <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
            Prezzo minimo (€)
          </Label>
          <DecimalField
            value={minimumPrice}
            onCommit={(raw) => onCommit('minimumPrice', raw)}
            className="h-9 rounded-[9px] border-input bg-background font-mono text-[13.5px]"
          />
        </div>
      </fieldset>

      {minimumActive && (
        <div className="mb-3 flex items-center gap-1.5 text-[11.5px] font-medium text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          minimo attivo
        </div>
      )}

      <div className="mb-1.5 flex items-center justify-between gap-2.5">
        <span className="min-w-0 text-[13px] text-muted-foreground">Prezzo/pz</span>
        <span className="flex-none whitespace-nowrap font-mono text-sm font-semibold text-foreground">
          {eur2(unitPrice + managementPerPiece)}
        </span>
      </div>
      {managementPerPiece > 0 && (
        <div className="mb-1.5 flex flex-col gap-1">
          <SubRow label="di cui spese di gestione" value={managementPerPiece} />
        </div>
      )}
      <div
        className={cn(
          'flex items-center justify-between gap-2.5 rounded-[11px] bg-primary/10 px-3.5 py-3',
        )}
      >
        <span className="min-w-0 text-[12.5px] font-semibold text-primary">
          × {quantity} = Totale/pz
        </span>
        <span className="flex-none whitespace-nowrap font-mono text-[17px] font-bold text-primary">
          {eur2(totalPrice + managementPerPiece * quantity)}
        </span>
      </div>
    </div>
  )
}
