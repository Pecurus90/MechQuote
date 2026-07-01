import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowUp, ArrowDown } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Tool } from '@/types'

type ScanMode = 'load' | 'unload'

// Barra scan codice a barre: +1 / -1 quantità per ogni "sparo". Auto-contenuta:
// gestisce modalità, input e refocus per scan rapidi consecutivi.
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
      const symbol = scanMode === 'load' ? '+1' : '−1'
      toast.success(`${t.code}: ${symbol} → qty ${t.quantity}`, {
        description: t.quantity < t.minimum_quantity ? `⚠ Sotto minimo (${t.minimum_quantity})` : undefined,
      })
      setScanCode('')
      onScanned()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore scan')
      setScanCode('')
    } finally {
      scanInputRef.current?.focus()
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex border rounded-md overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setScanMode('load')}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                scanMode === 'load' ? 'bg-green-600 text-white' : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <ArrowUp className="w-4 h-4" /> Carico
            </button>
            <button
              type="button"
              onClick={() => setScanMode('unload')}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                scanMode === 'unload' ? 'bg-rose-600 text-white' : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <ArrowDown className="w-4 h-4" /> Scarico
            </button>
          </div>
          <form onSubmit={handleScan} className="flex-1 min-w-[260px]">
            <Input
              ref={scanInputRef}
              value={scanCode}
              onChange={e => setScanCode(e.target.value)}
              placeholder={scanMode === 'load' ? 'Spara il codice per AGGIUNGERE 1 pz...' : 'Spara il codice per RIMUOVERE 1 pz...'}
              autoFocus
              className="h-11 text-base font-mono"
            />
          </form>
          <span className="text-xs text-muted-foreground">
            Pistola barcode → premi Enter per confermare automaticamente
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
