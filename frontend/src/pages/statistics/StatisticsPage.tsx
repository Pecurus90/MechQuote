// Sezione Statistiche & Grafici.
// Container con 3 tab (Preventivi / Materiali / Utensili). Filtro periodo
// in alto, condiviso tra i tab. Ogni tab fetcha il proprio endpoint dedicato.
import { useState } from 'react'
import { LineChart as LineIcon } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import { type Period, PERIOD_LABEL } from './statsShared'
import QuotesStatsTab from './QuotesStatsTab'
import MaterialsStatsTab from './MaterialsStatsTab'
import ToolsStatsTab from './ToolsStatsTab'

type Tab = 'quotes' | 'materials' | 'tools'

const TAB_CONFIG: Array<{ id: Tab; label: string }> = [
  { id: 'quotes',    label: 'Preventivi' },
  { id: 'materials', label: 'Materiali' },
  { id: 'tools',     label: 'Utensili' },
]

export default function StatisticsPage() {
  const [tab, setTab] = useState<Tab>('quotes')
  const [period, setPeriod] = useState<Period>('year')

  return (
    <StandardPage
      icon={LineIcon}
      color="blue"
      width="xl"
      title="Statistiche"
      subtitle="Analisi preventivi, ordini materiali e utensili"
      actions={
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={period}
          onChange={e => setPeriod(e.target.value as Period)}
        >
          {(Object.keys(PERIOD_LABEL) as Period[]).map(p => (
            <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
          ))}
        </select>
      }
    >
      <div className="flex gap-2 border-b overflow-x-auto">
        {TAB_CONFIG.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'quotes'    && <QuotesStatsTab period={period} />}
      {tab === 'materials' && <MaterialsStatsTab period={period} />}
      {tab === 'tools'     && <ToolsStatsTab period={period} />}
    </StandardPage>
  )
}
