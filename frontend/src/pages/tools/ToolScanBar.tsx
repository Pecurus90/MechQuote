import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { ScanBarcode, Barcode, PlusCircle, MinusCircle, Keyboard } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Tool } from '@/types'

type ScanMode = 'load' | 'unload'

// Barra scan codice a barre (protagonista): +1 / -1 quantità per ogni "sparo".
// Auto-contenuta: gestisce modalità, input e refocus per scan rapidi consecutivi.
// Tutto da tastiera — pensata per l'uso al bancone con la pistola barcode.
export default function ToolScanBar({ onScanned }: { onScanned: () => void }) {
  const [scanMode, setScanMode] = useState<ScanMode>('unload')
  const [scanCode, setScanCode] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = scanCode.trim()
    if (!code) return
    try {
      const res = await api.post('/tools/scan', { code, mode: scanMode, quantity: 1 })
      const t = res.data as Tool
      const symbol = scanMode === 'load' ? 'carico +1' : 'scarico −1'
      const below = t.quantity < t.minimum_quantity && t.minimum_quantity > 0
      if (below) {
        toast.warning(`${t.code} · ${symbol} → ${t.quantity} / ${t.minimum_quantity} sotto scorta minima`)
      } else {
        toast.success(`${t.code} · ${symbol} → quantità ${t.quantity}`)
      }
      setScanCode('')
      onScanned()
      scanInputRef.current?.focus()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      // AUD-31: nomina il codice che ha fallito e NON svuotare il campo, così
      // al bancone si vede quale "sparo" non è andato. Selezioniamo il testo:
      // il prossimo scan (che digita+Enter) lo sostituisce automaticamente.
      toast.error(`${code}: ${err?.response?.data?.detail || 'codice non trovato'}`)
      const el = scanInputRef.current
      if (el) { el.focus(); el.select() }
    }
  }

  const segBtn = (mode: ScanMode, active: string, label: string, Icon: typeof PlusCircle) => (
    <button
      type="button"
      onClick={() => { setScanMode(mode); scanInputRef.current?.focus() }}
      className={`flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors ${
        scanMode === mode ? `${active} text-white shadow-sm` : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )

  return (
    <div className="rounded-[14px] border border-tools/[0.35] bg-tools/[0.06] px-4 py-[18px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-tools/[0.14] text-tools">
            <ScanBarcode className="h-[18px] w-[18px]" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">Scansione rapida</div>
            <div className="text-[11px] text-muted-foreground">Enter conferma · il campo si rimette a fuoco da solo</div>
          </div>
        </div>

        {/* Toggle segmentato Carico / Scarico */}
        <div className="flex flex-none gap-1 rounded-[10px] bg-muted p-[3px]">
          {segBtn('load', 'bg-success', 'Carico +1', PlusCircle)}
          {segBtn('unload', 'bg-danger', 'Scarico −1', MinusCircle)}
        </div>

        {/* Campo scan */}
        <form onSubmit={handleScan} className="relative min-w-[240px] flex-1">
          <Barcode className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanInputRef}
            value={scanCode}
            onChange={e => setScanCode(e.target.value)}
            placeholder="Spara il codice a barre…"
            autoFocus
            className="h-11 pl-10 font-mono text-[15px]"
          />
        </form>

        <span className="flex flex-none items-center gap-1.5 text-xs text-muted-foreground">
          <Keyboard className="h-4 w-4" /> Tutto da tastiera
        </span>
      </div>
    </div>
  )
}
