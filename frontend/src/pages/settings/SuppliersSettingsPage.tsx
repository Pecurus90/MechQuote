// Container che raggruppa le 4 pagine fornitori in tab interni.
// Le pagine atomiche restano file separati e si auto-gestiscono il padding/header.
import { useState } from 'react'
import { Truck } from 'lucide-react'

import StandardPage from '@/components/layout/StandardPage'
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
    <StandardPage
      icon={Truck}
      color="blue"
      title="Fornitori"
      subtitle="Anagrafiche fornitori divise per tipologia"
      width="xl"
    >
      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-blue-600 text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
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
    </StandardPage>
  )
}
