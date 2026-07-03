// Select shadcn-compatibile SENZA Radix (il progetto non usa Radix).
// Espone l'API Select/SelectTrigger/SelectValue/SelectContent/SelectItem.
// Il menu è reso in PORTAL (position:fixed sotto il trigger) così non viene mai
// tagliato da un contenitore con overflow-hidden (es. card fase). Gli item
// restano montati anche a menu chiuso (display:none) per registrare le label.
import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectCtx {
  value?: string
  onValueChange?: (v: string) => void
  open: boolean
  setOpen: (o: boolean) => void
  register: (value: string, label: React.ReactNode) => void
  labels: Map<string, React.ReactNode>
  triggerEl: HTMLButtonElement | null
  setTriggerEl: (el: HTMLButtonElement | null) => void
  setContentEl: (el: HTMLDivElement | null) => void
}
const Ctx = React.createContext<SelectCtx | null>(null)
function useSelect() {
  const c = React.useContext(Ctx)
  if (!c) throw new Error("I sotto-componenti Select devono stare dentro <Select>")
  return c
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const labels = React.useRef<Map<string, React.ReactNode>>(new Map()).current
  const [, force] = React.useReducer((x) => x + 1, 0)
  const [triggerEl, setTriggerEl] = React.useState<HTMLButtonElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const setContentEl = React.useCallback((el: HTMLDivElement | null) => { contentRef.current = el }, [])

  const register = React.useCallback((v: string, label: React.ReactNode) => {
    labels.set(v, label)
    force()
  }, [labels])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerEl && triggerEl.contains(t)) return
      if (contentRef.current && contentRef.current.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, triggerEl])

  return (
    <Ctx.Provider value={{ value, onValueChange, open, setOpen, register, labels, triggerEl, setTriggerEl, setContentEl }}>
      <div className="relative">{children}</div>
    </Ctx.Provider>
  )
}

export function SelectTrigger({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const { open, setOpen, setTriggerEl } = useSelect()
  return (
    <button
      ref={setTriggerEl}
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </button>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, labels } = useSelect()
  const label = value != null && value !== "" ? labels.get(value) : undefined
  return (
    <span className={cn("truncate text-left", label == null && "text-muted-foreground")}>
      {label ?? placeholder}
    </span>
  )
}

export function SelectContent({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const { open, triggerEl, setContentEl } = useSelect()
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!open || !triggerEl) return
    const update = () => {
      const r = triggerEl.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, triggerEl])

  // Sempre montato (display:none quando chiuso) così i SelectItem registrano le label.
  return createPortal(
    <div
      ref={setContentEl}
      style={
        open && pos
          ? { position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }
          : { display: "none" }
      }
      className={cn(
        "max-h-60 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-[0_16px_44px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

export function SelectItem({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const { value: current, onValueChange, setOpen, register } = useSelect()
  React.useEffect(() => {
    register(value, children)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <button
      type="button"
      onClick={() => {
        onValueChange?.(value)
        setOpen(false)
      }}
      className={cn(
        "flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted/60",
        current === value && "bg-muted font-medium",
        className,
      )}
    >
      {children}
    </button>
  )
}
