const KEY = 'auth_token'

export function getToken(): string | null { return localStorage.getItem(KEY) }
export function setToken(t: string | null) {
  if (t) localStorage.setItem(KEY, t)
  else localStorage.removeItem(KEY)
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken()
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> | undefined) }
  if (opts.body) headers['content-type'] = 'application/json'
  if (token) headers['authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...opts, headers })
  if (res.status === 401) {
    setToken(null)
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('unauthorized')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
