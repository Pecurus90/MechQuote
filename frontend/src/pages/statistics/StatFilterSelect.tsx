// src/pages/statistics/StatFilterSelect.tsx
// Select filtro locale dei tab Statistiche (stile handoff): usato da
// Materiali e Utensili. Coerente con la select Cliente di QuotesStatsView.
import { ChevronDown } from 'lucide-react'

export interface FilterOption { value: string; label: string }

interface Props {
  value: string
  options: FilterOption[]
  onChange: (v: string) => void
  width?: number
}

export function FilterSelect({ value, options, onChange, width = 210 }: Props) {
  return (
    <div className="relative" style={{ width }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[38px] w-full cursor-pointer appearance-none rounded-[9px] border border-input bg-background pl-3 pr-8 text-[13.5px] text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/[0.18]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[11px] top-[11px] h-[15px] w-[15px] text-muted-foreground" />
    </div>
  )
}
