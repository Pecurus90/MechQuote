import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type {
  Category, Customer, Material, CuttingCycle, DrillingTime,
  EdmConfig, Machine, Operation,
} from '@/types'
import DxfProfilePicker, { type DxfPickerState } from '@/components/quotes/Dxf/DxfProfilePicker'
import Dxf2dWizard from '@/components/quotes/Dxf2dWizard'

/** Page shell: header + caricamento dati di riferimento + layout 2-col.
 *  Form logic (state, validate, submit) vive in Dxf2dWizard. */
export default function NewQuote2DPage() {
  // Lookup data
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [cycles, setCycles] = useState<CuttingCycle[]>([])
  const [drillingRows, setDrillingRows] = useState<DrillingTime[]>([])
  const [edmConfig, setEdmConfig] = useState<EdmConfig | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)

  // DXF state — gestito dal picker e passato al wizard via prop.
  const [dxf, setDxf] = useState<DxfPickerState | null>(null)
  // Grezzo corrente del form (esposto dal wizard via callback): serve al
  // picker per disegnare il rect overlay verde/rosso in tempo reale.
  const [currentRaw, setCurrentRaw] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/materials'),
      api.get('/cutting-cycles'),
      api.get('/drilling-times'),
      api.get('/edm-config'),
      api.get('/machines'),
      api.get('/operations'),
    ]).then(([cat, cus, mat, cyc, dr, cfg, mc, ops]) => {
      setCategories(cat.data)
      setCustomers(cus.data)
      setMaterials(mat.data)
      setCycles(cyc.data)
      setDrillingRows(dr.data)
      setEdmConfig(cfg.data)
      setMachines(mc.data)
      setOperations(ops.data)
    }).catch(() => toast.error('Errore nel caricamento dei dati di riferimento'))
      .finally(() => setLoadingRefs(false))
  }, [])

  if (loadingRefs) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-lg font-bold">Nuovo Preventivo 2D</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Carica un DXF, seleziona i profili da tagliare e compila i dati. Il sistema calcola automaticamente
          il tempo Wire EDM dai parametri del materiale e dal ciclo scelto.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className={`max-w-7xl mx-auto ${dxf?.analysis ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-4'}`}>

          {/* Pannello sinistro / unico: viewer DXF (sempre montato per
              preservare lo state interno tra dropzone → analisi) */}
          <div className="space-y-3">
            <DxfProfilePicker
              onChange={setDxf}
              rawX={currentRaw?.x}
              rawY={currentRaw?.y}
            />
          </div>

          {/* Pannello destro: form (solo se DXF caricato) */}
          {dxf?.analysis && (
            <Dxf2dWizard
              dxf={dxf}
              categories={categories}
              customers={customers}
              materials={materials}
              cycles={cycles}
              drillingRows={drillingRows}
              edmConfig={edmConfig}
              machines={machines}
              operations={operations}
              onRawStockChange={setCurrentRaw}
            />
          )}

        </div>
      </div>
    </div>
  )
}
