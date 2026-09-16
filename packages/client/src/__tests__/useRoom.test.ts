import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { fakeSocket, handlers, push, router } = vi.hoisted(() => {
  const handlers: Record<string, ((...a: any[]) => void)[]> = {}
  const fakeSocket = {
    on: vi.fn((evt: string, fn: (...a: any[]) => void) => { (handlers[evt] ||= []).push(fn) }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    off: vi.fn(),
  }
  const push = vi.fn()
  const router = { push, currentRoute: { value: { name: 'room', params: { code: 'ABCDEF' } } } }
  return { fakeSocket, handlers, push, router }
})

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket), Socket: class {} }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../../src/composables/useGame', () => ({ useGame: () => ({ setupListeners: vi.fn() }) }))
vi.mock('../../src/api', () => ({ apiFetch: vi.fn(async () => ({ players: [] })), getToken: vi.fn(() => 'T'), setToken: vi.fn() }))
vi.mock('../../src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }))

import { useSocket } from '../../src/composables/useSocket'
import { useRoom } from '../../src/composables/useRoom'
import { useGameStore } from '../../src/stores/game'

const fire = (evt: string, payload?: any) => { for (const fn of handlers[evt] || []) fn(payload) }

describe('useRoom full_state navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
    router.currentRoute.value.name = 'room'
  })

  it('moves onto the game screen on full_state (game_started was missed while offline)', () => {
    useSocket().connect()
    const room = useRoom()
    room.resetRoom()
    room.setupListeners()
    fire('full_state', { roomCode: 'ABCDEF' })
    expect(push).toHaveBeenCalledWith('/game/ABCDEF')
  })

  it('stays put when already on the game screen', () => {
    router.currentRoute.value.name = 'game'
    useSocket().connect()
    const room = useRoom()
    room.resetRoom()
    room.setupListeners()
    fire('full_state', { roomCode: 'ABCDEF' })
    expect(push).not.toHaveBeenCalled()
  })

  it('routes an incoming chat message into the game store', () => {
    useSocket().connect()
    const room = useRoom()
    room.resetRoom()
    room.setupListeners()
    fire('chat_message', { playerId: 'p1', name: '甲', text: '好啵', at: 1 })
    const s = useGameStore()
    expect(s.chatMessages).toHaveLength(1)
    expect(s.chatBubbles.p1).toBe('好啵')
  })

  it('returns to the lobby when the seat is gone', () => {
    useSocket().connect()
    const room = useRoom()
    room.resetRoom()
    room.setupListeners()
    fire('error', { message: 'Player not found' })
    expect(push).toHaveBeenCalledWith('/lobby')
  })
})
