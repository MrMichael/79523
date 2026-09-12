import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../api', () => ({
  apiFetch: vi.fn(async () => []),
  getToken: vi.fn(() => 'T'),
  setToken: vi.fn(),
}))
vi.mock('../composables/useSocket', () => ({
  useSocket: () => ({ socket: { value: null }, connect: vi.fn(), disconnect: vi.fn() }),
}))

import { mount, flushPromises } from '@vue/test-utils'
import { apiFetch } from '../api'
import RoomList from '../components/lobby/RoomList.vue'
import UserList from '../components/lobby/UserList.vue'
import Leaderboard from '../components/lobby/Leaderboard.vue'

describe('RoomList', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('renders rooms and disables in-game join', () => {
    const w = mount(RoomList, {
      props: {
        rooms: [
          { code: 'A1', hostName: 'h', playerCount: 1, maxPlayers: 6, inGame: false },
          { code: 'B2', hostName: 'h', playerCount: 4, maxPlayers: 6, inGame: true },
        ],
      },
    })
    const items = w.findAll('.room-item')
    expect(items).toHaveLength(2)
    expect(items[1].find('button').attributes('disabled')).toBeDefined()
  })

  it('emits join with the room code', async () => {
    const w = mount(RoomList, {
      props: { rooms: [{ code: 'A1', hostName: 'h', playerCount: 1, maxPlayers: 6, inGame: false }] },
    })
    await w.find('.room-item button').trigger('click')
    expect(w.emitted('join')?.[0]).toEqual(['A1'])
  })
})

describe('UserList', () => {
  it('sorts online users first', () => {
    const w = mount(UserList, {
      props: {
        users: [
          { id: '1', username: 'b', role: 'user', wins: 0, boxerWins: 0, online: false },
          { id: '2', username: 'a', role: 'user', wins: 0, boxerWins: 0, online: true },
        ],
      },
    })
    const names = w.findAll('.user-item .name').map(n => n.text())
    expect(names).toEqual(['a', 'b'])
  })

  it('shows the last-24h play time', () => {
    const w = mount(UserList, {
      props: {
        users: [{ id: '1', username: 'a', role: 'user', wins: 0, boxerWins: 0, online: true, playSeconds24h: 3720 }],
      },
    })
    expect(w.find('.playtime').text()).toContain('1小时2分')
  })
})

describe('Leaderboard', () => {
  it('shows 24h wins/boxer/time when the 近24小时 tab is active', async () => {
    (apiFetch as any).mockResolvedValue([
      { id: '1', username: 'a', wins: 9, boxerWins: 4, wins24h: 2, boxerWins24h: 1, playSeconds24h: 3600, online: true },
    ])
    const w = mount(Leaderboard)
    await flushPromises()
    await w.findAll('.metric-tabs button')[2].trigger('click')
    await flushPromises()
    const row = w.find('.rank-row').text()
    expect(row).toContain('🏆 2')
    expect(row).toContain('🥊 1')
    expect(row).toContain('1小时0分')
    expect((apiFetch as any).mock.calls.at(-1)[0]).toContain('metric=wins24h')
  })
})
