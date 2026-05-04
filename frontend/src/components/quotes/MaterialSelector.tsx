import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'

interface Material {
  id: number
  name: string
  family: string
  density_kg_dm3: number
  cost_per_kg: number
}

interface Props {
  value: number | undefined
  onChange: (id: number, material: Material) => void
}

export default function MaterialSelector({ value, onChange }: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/materials').then(res => {
      setMaterials(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const selected = materials.find(m => m.id === value)

  return (
    <div>
      <label className="text-sm font-medium mb-1 block">Materiale</label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={value || ''}
        onChange={(e) => {
          const mat = materials.find(m => m.id === Number(e.target.value))
          if (mat) onChange(mat.id, mat)
        }}
      >
        <option value="">Seleziona materiale...</option>
        {materials.map(m => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.family}) - €{m.cost_per_kg}/kg
          </option>
        ))}
      </select>
      {selected && (
        <p className="text-xs text-gray-500 mt-1">
          Densità: {selected.density_kg_dm3} kg/dm³ | Costo: €{selected.cost_per_kg}/kg
        </p>
      )}
    </div>
  )
}
