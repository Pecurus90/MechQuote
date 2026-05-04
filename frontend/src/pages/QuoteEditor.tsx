import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function QuoteEditor() {
  const navigate = useNavigate()
  const [quoteMode, setQuoteMode] = useState<'manual' | 'dxf' | 'step'>('manual')

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Nuovo Preventivo</h1>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          Torna alla Dashboard
        </Button>
      </div>

      {/* Quote Header */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Dati Preventivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Numero Preventivo</label>
              <Input placeholder="Auto-generato" disabled />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cliente</label>
              <Input placeholder="Nome cliente" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Riferimento Cliente</label>
              <Input placeholder="Riferimento" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Valuta</label>
              <Input value="EUR" disabled />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Giorni Validità</label>
              <Input type="number" defaultValue={30} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quote Mode Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Modalità Preventivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { mode: 'manual', label: 'Manuale', desc: 'Crea preventivo senza file CAD' },
              { mode: 'dxf', label: '2D DXF', desc: 'Quotazione assistita per EDM filo' },
              { mode: 'step', label: '3D STEP', desc: 'Quotazione assistita per CNC' },
            ].map(({ mode, label, desc }) => (
              <button
                key={mode}
                onClick={() => setQuoteMode(mode as 'manual' | 'dxf' | 'step')}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  quoteMode === mode
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <h3 className="font-semibold mb-1">{label}</h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Parts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Codici Parti</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm mb-4">
            Aggiungi le parti per questo preventivo. Ogni parte può avere materiale, lavorazioni e costi specifici.
          </p>
          <Button>
            + Aggiungi Parte
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
