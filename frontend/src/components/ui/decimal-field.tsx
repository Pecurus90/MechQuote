import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Input } from '@/components/ui/input'

type Props = Omit<
  ComponentPropsWithoutRef<typeof Input>,
  'value' | 'onChange' | 'onBlur' | 'onFocus' | 'type'
> & {
  /** Valore canonico da mostrare a riposo (già stringa del numero del modello). */
  value: string
  /** Chiamato al blur SOLO se il testo è cambiato: il chiamante fa parse + commit. */
  onCommit: (raw: string) => void
}

/**
 * Campo numerico del preventivatore.
 *
 * Bug "casino atomico" (risolto qui): un `<Input>` controllato dal numero già
 * parsato strippava il separatore decimale ad ogni tasto — il round-trip
 * testo→numero→testo rimetteva `1` mentre digitavi `1,5` (o `1.5`). Qui teniamo
 * un BUFFER locale del testo mentre il campo è a fuoco, così i separatori non
 * vengono mai toccati durante la digitazione. Il commit (parse + salvataggio)
 * lo fa il chiamante al blur, via `onCommit`.
 *
 * `type="text"` + `inputMode="decimal"`: tastierino numerico su mobile e nessun
 * rifiuto della virgola (che invece `type="number"` fa in locale IT). Accetta
 * sia `,` sia `.` — il chiamante normalizza con `parseDecimal`.
 */
export const DecimalField = forwardRef<HTMLInputElement, Props>(function DecimalField(
  { value, onCommit, ...rest },
  ref,
) {
  const [buf, setBuf] = useState(value)
  const [focused, setFocused] = useState(false)

  // M-1: flush del buffer pendente allo smontaggio. Se l'utente naviga via
  // (link sidebar, tasto Indietro) mentre il campo è a FUOCO senza dare blur,
  // `onBlur` non scatta e l'ultimo valore digitato andrebbe perso senza avviso.
  // Un ref tiene sempre l'ultimo stato per il cleanup, che gira una sola volta
  // all'unmount e committa solo se c'è davvero un edit non salvato.
  const pending = useRef({ buf, value, focused, onCommit })
  pending.current = { buf, value, focused, onCommit }
  useEffect(() => () => {
    const p = pending.current
    if (p.focused && p.buf !== p.value) p.onCommit(p.buf)
  }, [])

  return (
    <Input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      value={focused ? buf : value}
      onFocus={(e) => {
        setBuf(value)
        setFocused(true)
        e.currentTarget.select()
      }}
      onChange={(e) => setBuf(e.target.value)}
      onBlur={() => {
        setFocused(false)
        if (buf !== value) onCommit(buf)
      }}
    />
  )
})
