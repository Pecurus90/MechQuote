// Container che raggruppa le 4 pagine fornitori in tab interni.
// Le pagine atomiche restano file separati e si auto-gestiscono il padding/header.
import { useState } from 'react'
import { Truck } from 'lucide-react'

import PageContainer from '@/components/ui/page-container'
import MaterialSuppliersPage from './MaterialSuppliersPage'
import TreatmentSuppliersPage from './TreatmentSuppliersPage'
import ToolSuppliersPage from './ToolSuppliersPage'
import NormalizedSuppliersPage from './NormalizedSuppliersPage'

type Tab = 'materials' | 'treatments' | 'tools' | 'normalized'

const TAB_LABELS: Record<Tab, string> = {
  materials: 'Materiali',
  treatments: 'Lavorazioni esterne',
  tools: 'Utensili',
  normalized: 'Normalizzati',
}

export default function SuppliersSettingsPage() {
  const [tab, setTab] = useState<Tab>('materials')

  return (
    <PageContainer width="xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
          <Truck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Fornitori</h1>
          <p className="text-xs text-gray-500">Anagrafiche fornitori divise per tipologia</p>
        </div>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="-mx-6">  {/* compensa il p-6 del container: le pagine atomiche hanno già il loro padding */}
        {tab === 'materials' && <MaterialSuppliersPage />}
        {tab === 'treatments' && <TreatmentSuppliersPage />}
        {tab === 'tools' && <ToolSuppliersPage />}
        {tab === 'normalized' && <NormalizedSuppliersPage />}
      </div>
    </PageContainer>
  )
}
