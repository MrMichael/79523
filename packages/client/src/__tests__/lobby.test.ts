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

  it('lets you join an in-game room (waiting for the next game) but not a full one', () => {
    const w = mount(RoomList, {
      props: {
        rooms: [
          { code: 'A1', hostName: 'h', playerCount: 1, maxPlayers: 6, inGame: false },
          { code: 'B2', hostName: 'h', playerCount: 4, maxPlayers: 6, inGame: true },
          { code: 'C3', hostName: 'h', playerCount: 6, maxPlayers: 6, inGame: false },
        ],
      },
    })
    const items = w.findAll('.room-item')
    expect(items).toHaveLength(3)
    // 进行中的房间也能进（进去等下一局），按钮文案说明白这一点
    expect(items[1].find('button').attributes('disabled')).toBeUndefined()
    expect(items[1].find('button').text()).toBe('等下一局')
    // 满员才是真的进不去
    expect(items[2].find('button').attributes('disabled')).toBeDefined()
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
    expect((apiFetch as any).mock.calls.at(-1)[0]).toContain('metric=wins24h')
  })
})
