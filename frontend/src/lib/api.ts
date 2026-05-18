import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Estrae il messaggio d'errore dal payload di axios.
 *
 * FastAPI normalmente risponde con `{ "detail": "msg" }` (HTTPException) o
 * `{ "detail": [ ... ] }` (validazione Pydantic). Qualche endpoint a volte
 * usa `message` o annida liste di errori. Questo helper copre i casi comuni
 * senza obbligare ogni call site a tipare un `any`.
 */
export function getApiErrorDetail(err: unknown, fallback = 'Errore'): string {
  const anyErr = err as { response?: { data?: unknown }; message?: string }
  const data = anyErr?.response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const d = (data as { detail?: unknown; message?: unknown }).detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object' && 'msg' in (first as object)) {
        return String((first as { msg: unknown }).msg)
      }
    }
    const m = (data as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  if (typeof anyErr?.message === 'string') return anyErr.message
  return fallback
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
