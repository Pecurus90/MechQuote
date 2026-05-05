import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import PartList from '@/components/quotes/PartList'
import MaterialSelector from '@/components/quotes/MaterialSelector'
import PhaseEditor from '@/components/quotes/PhaseEditor'
import FileUpload from '@/components/quotes/FileUpload'
import api from '@/lib/api'

interface Phase {
  id?: number
  sequence_number: number
  phase_type: string
  description: string
  machine_id?: number
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  calculated_cost: number
  customer_visible: boolean
}

interface UploadedFile {
  id: number
  file_type: string
  filename: string
  path: string
}

interface Part {
  id?: number
  part_code: string
  revision: string
  description: string
  quantity: number
  quote_mode: string
  material_id?: number
  material_name?: string
  unit_price: number
  total_price: number
  total_cost: number
  phases: Phase[]
  files?: UploadedFile[]
}

interface Quote {
  id?: number
  quote_number: string
  customer_name: string
  date: string
  parts: Part[]
}

export default function QuoteEditor() {
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quote>({
    quote_number: '',
    customer_name: '',
    date: new Date().toISOString().split('T')[0],
    parts: [],
  })
  const [selectedPartIdx, setSelectedPartIdx] = useState(-1)
  const [loading, setLoading] = useState(false)

  const selectedPart = selectedPartIdx >= 0 ? quote.parts[selectedPartIdx] : null

  const saveQuote = async () => {
    setLoading(true)
    try {
      if (quote.id) {
        await api.put(`/quotes/${quote.id}`, {
          customer_name: quote.customer_name,
          date: quote.date,
        })
      } else {
        const res = await api.post('/quotes', {
          customer_name: quote.customer_name,
          date: quote.date,
        })
        setQuote(prev => ({ ...prev, id: res.data.id, quote_number: res.data.quote_number }))
      }
    } catch (e) {
      console.error('Error saving quote', e)
    } finally {
      setLoading(false)
    }
  }

  const duplicatePart = async (idx: number) => {
    const part = quote.parts[idx]
    if (!part) return
    if (!quote.id) await saveQuote()
    const qId = quote.id
    if (!qId) return

    try {
      const res = await api.post(`/quotes/${qId}/parts`, {
        ...part,
        part_code: `${part.part_code}_copy`,
      })
      setQuote(prev => ({
        ...prev,
        parts: [...prev.parts, res.data],
      }))
    } catch (e) {
      console.error('Error duplicating part', e)
    }
  }

  const addPart = async () => {
    if (!quote.id) await saveQuote()
    const qId = quote.id
    if (!qId) return

    try {
      const res = await api.post(`/quotes/${qId}/parts`, {
        part_code: `P${quote.parts.length + 1}`,
        quantity: 1,
        quote_mode: 'manual',
      })
      setQuote(prev => ({
        ...prev,
        parts: [...prev.parts, res.data],
      }))
      setSelectedPartIdx(quote.parts.length)
    } catch (e) {
      console.error('Error adding part', e)
    }
  }

  const removePart = async (idx: number) => {
    const part = quote.parts[idx]
    if (part.id) {
      try { await api.delete(`/parts/${part.id}`) } catch (e) { console.error(e) }
    }
    setQuote(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== idx),
    }))
    setSelectedPartIdx(-1)
  }

  const updatePart = (field: string, value: any) => {
    if (selectedPartIdx < 0) return
    setQuote(prev => ({
      ...prev,
      parts: prev.parts.map((p, i) => i === selectedPartIdx ? { ...p, [field]: value } : p),
    }))
  }

  const downloadPdf = async (type: 'customer' | 'internal') => {
    if (!quote.id) return
    try {
      const res = await api.get(`/quotes/${quote.id}/pdf/${type}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `preventivo_${quote.quote_number}_${type}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (e) { console.error('Error downloading PDF', e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Nuovo Preventivo {quote.quote_number && `- ${quote.quote_number}`}</h1>
        <div className="flex gap-2">
          {quote.id && (
            <>
              <Button variant="outline" onClick={() => downloadPdf('customer')}>
                PDF Cliente
              </Button>
              <Button variant="outline" onClick={() => downloadPdf('internal')}>
                PDF Interno
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Torna alla Dashboard
          </Button>
        </div>
      </div>

      {/* Quote Header */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Dati Preventivo {quote.quote_number && ` - ${quote.quote_number}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Numero</label>
              <Input value={quote.quote_number} disabled placeholder="Auto-generato" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <Input type="date" value={quote.date} onChange={e => setQuote({...quote, date: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cliente</label>
              <Input
                placeholder="Nome cliente"
                value={quote.customer_name}
                onChange={e => setQuote({...quote, customer_name: e.target.value})}
                onBlur={saveQuote}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={saveQuote} disabled={loading}>
              {loading ? 'Salvataggio...' : 'Salva Preventivo'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Part List */}
        <div className="lg:col-span-1">
          <PartList
            parts={quote.parts}
            onAdd={addPart}
            onRemove={removePart}
            onDuplicate={duplicatePart}
            onSelect={setSelectedPartIdx}
            selectedIdx={selectedPartIdx}
          />
        </div>

        {/* Part Editor */}
        <div className="lg:col-span-2">
          {selectedPart ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Edit Part: {selectedPart.part_code}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Codice Parte</label>
                      <Input
                        value={selectedPart.part_code}
                        onChange={e => updatePart('part_code', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Revisione</label>
                      <Input
                        value={selectedPart.revision}
                        onChange={e => updatePart('revision', e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium mb-1 block">Descrizione</label>
                      <Input
                        value={selectedPart.description || ''}
                        onChange={e => updatePart('description', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Quantità</label>
                      <Input
                        type="number"
                        value={selectedPart.quantity}
                        onChange={e => updatePart('quantity', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Modalità</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={selectedPart.quote_mode}
                        onChange={e => updatePart('quote_mode', e.target.value)}
                      >
                        <option value="manual">Manuale</option>
                        <option value="dxf">2D DXF</option>
                        <option value="step">3D STEP</option>
                        <option value="mixed">Misto</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <MaterialSelector
                        value={selectedPart.material_id}
                        onChange={(id, mat) => {
                          updatePart('material_id', id)
                          updatePart('material_name', mat.name)
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold mb-2">Riepilogo Costi</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Costo Totale:</span>
                      <span className="text-right font-medium">{selectedPart.total_cost?.toFixed(2) || '0.00'} €</span>
                      <span>Prezzo Unitario:</span>
                      <span className="text-right font-medium">{selectedPart.unit_price?.toFixed(2) || '0.00'} €</span>
                      <span className="font-semibold">Totale Parte:</span>
                      <span className="text-right font-bold">{selectedPart.total_price?.toFixed(2) || '0.00'} €</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <PhaseEditor
                partId={selectedPart.id}
                phases={selectedPart.phases || []}
                onChange={(phases) => updatePart('phases', phases)}
              />

              <FileUpload
                partId={selectedPart.id}
                files={selectedPart.files || []}
                onUploaded={() => {
                  if (selectedPart.id) {
                    api.get(`/parts/${selectedPart.id}`).then(res => {
                      updatePart('files', res.data.files || [])
                    })
                  }
                }}
              />
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <p>Seleziona una parte dalla lista o aggiungine una nuova per iniziare.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
