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

import { mount } from '@vue/test-utils'
import RoomList from '../components/lobby/RoomList.vue'
import UserList from '../components/lobby/UserList.vue'

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
})
