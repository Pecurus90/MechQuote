import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Hammer } from 'lucide-react'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Mini Label: i nuovi shadcn primitives non sono stati installati. <label>
// stilizzato come negli altri form della codebase.
function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-xs font-medium text-gray-600 block mb-1 ${className}`}>{children}</label>
}
import type { Customer, DieTemplate, DieSubtype, DieMode, DieDifficulty } from '@/types'

export default function NewDieQuotePage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [templates, setTemplates] = useState<DieTemplate[]>([])
  const [saving, setSaving] = useState(false)

  // Form state — wizard a singola pagina (MVP). Sezioni accordion sono polish
  // di iterazione successiva.
  const [quoteNumber, setQuoteNumber] = useState('')
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [customerName, setCustomerName] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [notesCustomer, setNotesCustomer] = useState('')
  const [notesInternal, setNotesInternal] = useState('')
  const [mode, setMode] = useState<DieMode>('detailed')
  const [templateId, setTemplateId] = useState<number | undefined>()
  const [dieSubtype, setDieSubtype] = useState<DieSubtype>('blocco')
  const [bboxX, setBboxX] = useState<string>('')
  const [bboxY, setBboxY] = useState<string>('')
  const [sheetThickness, setSheetThickness] = useState<string>('')
  const [nStations, setNStations] = useState<string>('')
  const [stripOffsetY, setStripOffsetY] = useState<string>('')
  const [blockStripOffset, setBlockStripOffset] = useState<string>('50')
  const [difficulty, setDifficulty] = useState<DieDifficulty>('base')
  const [nBendsS, setNBendsS] = useState<string>('0')
  const [nBendsM, setNBendsM] = useState<string>('0')
  const [nBendsC, setNBendsC] = useState<string>('0')
  const [nPunchesS, setNPunchesS] = useState<string>('0')
  const [nPunchesM, setNPunchesM] = useState<string>('0')
  const [nPunchesC, setNPunchesC] = useState<string>('0')
  const [deliveryDays, setDeliveryDays] = useState<string>('')
  const [extrasAmount, setExtrasAmount] = useState<string>('0')
  const [extrasDescription, setExtrasDescription] = useState<string>('')

  useEffect(() => {
    Promise.all([
      api.get('/customers'),
      api.get('/die-settings/templates'),
    ]).then(([c, t]) => {
      setCustomers(c.data)
      setTemplates(t.data)
    }).catch(() => toast.error('Errore caricamento dati'))
  }, [])

  // Quando l'utente seleziona un template, pre-compila subtype + difficoltà + feature.
  useEffect(() => {
    if (!templateId) return
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return
    setDieSubtype(tpl.die_subtype)
    setDifficulty(tpl.default_difficulty)
    setNStations(tpl.suggested_stations?.toString() || '')
    setNBendsS(tpl.suggested_n_bends_simple.toString())
    setNBendsM(tpl.suggested_n_bends_medium.toString())
    setNBendsC(tpl.suggested_n_bends_complex.toString())
    setNPunchesS(tpl.suggested_n_punches_simple.toString())
    setNPunchesM(tpl.suggested_n_punches_medium.toString())
    setNPunchesC(tpl.suggested_n_punches_complex.toString())
  }, [templateId, templates])

  const handleSubmit = async () => {
    if (!quoteNumber.trim()) {
      toast.error('Numero preventivo obbligatorio')
      return
    }
    if (!bboxX || !bboxY) {
      toast.error('Dimensioni pezzo (X, Y) obbligatorie')
      return
    }
    setSaving(true)
    try {
      const payload = {
        quote_number: quoteNumber.trim(),
        customer_id: customerId,
        customer_name: customerName.trim() || undefined,
        customer_reference: customerReference.trim() || undefined,
        notes_customer: notesCustomer.trim() || undefined,
        notes_internal: notesInternal.trim() || undefined,
        template_id: templateId,
        spec: {
          die_subtype: dieSubtype,
          mode,
          bbox_x_mm: parseFloat(bboxX) || 0,
          bbox_y_mm: parseFloat(bboxY) || 0,
          sheet_thickness_mm: parseFloat(sheetThickness) || 0,
          n_stations: dieSubtype === 'passo' && nStations ? parseInt(nStations, 10) : undefined,
          strip_offset_y_mm: dieSubtype === 'passo' ? (parseFloat(stripOffsetY) || 0) : 0,
          block_strip_offset_mm: dieSubtype === 'blocco' ? (parseFloat(blockStripOffset) || 0) : 0,
          difficulty,
          n_bends_simple: parseInt(nBendsS, 10) || 0,
          n_bends_medium: parseInt(nBendsM, 10) || 0,
          n_bends_complex: parseInt(nBendsC, 10) || 0,
          n_punches_simple: parseInt(nPunchesS, 10) || 0,
          n_punches_medium: parseInt(nPunchesM, 10) || 0,
          n_punches_complex: parseInt(nPunchesC, 10) || 0,
          delivery_days: deliveryDays ? parseInt(deliveryDays, 10) : undefined,
          extras_amount: parseFloat(extrasAmount) || 0,
          extras_description: extrasDescription.trim() || undefined,
        },
      }
      const res = await api.post('/dies', payload)
      toast.success('Preventivo stampo creato')
      navigate(`/quotes/${res.data.id}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore creazione preventivo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <Hammer className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuovo Preventivo Stampo</h1>
          <p className="text-sm text-gray-500">Compila i dati base — potrai rifinire piastre e costi nell'editor</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cliente & numero preventivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Numero preventivo *</Label>
              <Input value={quoteNumber} onChange={e => setQuoteNumber(e.target.value)} placeholder="es. DIE-26C-001" />
            </div>
            <div>
              <Label>Cliente</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={customerId || ''}
                onChange={e => {
                  const v = e.target.value ? Number(e.target.value) : undefined
                  setCustomerId(v)
                  const c = customers.find(cu => cu.id === v)
                  if (c) setCustomerName(c.name)
                }}
              >
                <option value="">— Cliente non in anagrafica —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Nome cliente (manuale)</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Se non in anagrafica" />
            </div>
            <div>
              <Label>Riferimento cliente</Label>
              <Input value={customerReference} onChange={e => setCustomerReference(e.target.value)} placeholder="es. RDA-2026-001" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modalità & template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'detailed' ? 'default' : 'outline'}
              onClick={() => setMode('detailed')}
            >Dettagliata</Button>
            <Button
              type="button"
              variant={mode === 'rapid' ? 'default' : 'outline'}
              onClick={() => setMode('rapid')}
            >Rapida (range stima)</Button>
          </div>
          <div>
            <Label>Template stampo</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={templateId || ''}
              onChange={e => setTemplateId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">— Nessun template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.die_subtype})</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">Se selezioni un template, le piastre vengono pre-create con le dimensioni standard.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipo stampo & geometria pezzo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={dieSubtype === 'passo' ? 'default' : 'outline'}
              onClick={() => setDieSubtype('passo')}
            >Passo (progressivo)</Button>
            <Button
              type="button"
              variant={dieSubtype === 'blocco' ? 'default' : 'outline'}
              onClick={() => setDieSubtype('blocco')}
            >Blocco</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Ingombro pezzo X (mm) *</Label>
              <Input type="number" value={bboxX} onChange={e => setBboxX(e.target.value)} placeholder="200" />
            </div>
            <div>
              <Label>Ingombro pezzo Y (mm) *</Label>
              <Input type="number" value={bboxY} onChange={e => setBboxY(e.target.value)} placeholder="150" />
            </div>
            <div>
              <Label>Spessore lamiera (mm)</Label>
              <Input type="number" value={sheetThickness} onChange={e => setSheetThickness(e.target.value)} placeholder="2" />
            </div>
          </div>
          {dieSubtype === 'passo' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Numero stazioni</Label>
                <Input type="number" value={nStations} onChange={e => setNStations(e.target.value)} placeholder="3" />
              </div>
              <div>
                <Label>Offset Y striscia (mm)</Label>
                <Input type="number" value={stripOffsetY} onChange={e => setStripOffsetY(e.target.value)} placeholder="50" />
              </div>
            </div>
          ) : (
            <div>
              <Label>Offset striscia blocco (mm)</Label>
              <Input type="number" value={blockStripOffset} onChange={e => setBlockStripOffset(e.target.value)} placeholder="50" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Difficoltà & feature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(['base', 'medium', 'hard'] as DieDifficulty[]).map(d => (
              <Button
                key={d}
                type="button"
                variant={difficulty === d ? 'default' : 'outline'}
                onClick={() => setDifficulty(d)}
              >{d === 'base' ? 'Base' : d === 'medium' ? 'Media' : 'Alta'}</Button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Pieghe semplici</Label>
              <Input type="number" value={nBendsS} onChange={e => setNBendsS(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Pieghe medie</Label>
              <Input type="number" value={nBendsM} onChange={e => setNBendsM(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Pieghe complesse</Label>
              <Input type="number" value={nBendsC} onChange={e => setNBendsC(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Punzoni semplici</Label>
              <Input type="number" value={nPunchesS} onChange={e => setNPunchesS(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Punzoni medi</Label>
              <Input type="number" value={nPunchesM} onChange={e => setNPunchesM(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Punzoni complessi</Label>
              <Input type="number" value={nPunchesC} onChange={e => setNPunchesC(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consegna, extras & note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Tempo di consegna (gg)</Label>
              <Input type="number" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} placeholder="30" />
            </div>
            <div>
              <Label>Extras (€)</Label>
              <Input type="number" value={extrasAmount} onChange={e => setExtrasAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="md:col-span-2 md:row-start-2 md:col-start-1">
              <Label>Descrizione extras</Label>
              <Input value={extrasDescription} onChange={e => setExtrasDescription(e.target.value)} placeholder="es. trasporto stampo, gabbia metallica" />
            </div>
          </div>
          <div>
            <Label>Note cliente (visibili in PDF)</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              value={notesCustomer}
              onChange={e => setNotesCustomer(e.target.value)}
            />
          </div>
          <div>
            <Label>Note interne</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              value={notesInternal}
              onChange={e => setNotesInternal(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/quotes/new')} disabled={saving}>Annulla</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Salvataggio…' : 'Crea preventivo'}
        </Button>
      </div>
    </div>
  )
}
