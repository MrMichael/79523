import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../api', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/api/auth/login') return { token: 'T', user: { id: 'u', username: 'a', role: 'user', wins: 0, boxerWins: 0, online: true } }
    return {}
  }),
  setToken: vi.fn(),
  getToken: vi.fn(() => null),
}))
vi.mock('../composables/useSocket', () => ({
  useSocket: () => ({ socket: { value: null }, connect: vi.fn(), disconnect: vi.fn() }),
}))

import { useAuthStore } from '../stores/auth'

describe('auth store', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('login stores token + user', async () => {
    const auth = useAuthStore()
    await auth.login('a', 'secret123')
    expect(auth.token).toBe('T')
    expect(auth.user?.username).toBe('a')
    expect(auth.isLoggedIn).toBe(true)
  })

  it('logout clears token + user', async () => {
    const auth = useAuthStore()
    await auth.login('a', 'secret123')
    auth.logout()
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isLoggedIn).toBe(false)
  })
})
