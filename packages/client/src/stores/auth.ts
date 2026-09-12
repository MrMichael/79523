import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch, setToken, getToken } from '../api'
import { useSocket } from '../composables/useSocket'

export interface AuthUser {
  id: string
  username: string
  role: 'admin' | 'user'
  wins: number
  boxerWins: number
  online: boolean
  playSeconds24h: number
  wins24h: number
  boxerWins24h: number
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<AuthUser | null>(null)
  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  function apply(t: string, u: AuthUser) {
    token.value = t
    user.value = u
    setToken(t)
  }

  async function login(username: string, password: string) {
    const d = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    apply(d.token, d.user)
  }
  async function register(username: string, password: string) {
    const d = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) })
    apply(d.token, d.user)
  }
  async function loadMe() {
    if (!token.value) return
    try {
      user.value = await apiFetch('/api/auth/me')
    } catch {
      token.value = null
      user.value = null
    }
  }
  function logout() {
    token.value = null
    user.value = null
    setToken(null)
    useSocket().disconnect()
  }

  return { token, user, isLoggedIn, isAdmin, login, register, loadMe, logout }
})
