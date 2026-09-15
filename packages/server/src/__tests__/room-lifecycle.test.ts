import { describe, test, expect, beforeEach } from '@jest/globals'
import { createRoom, joinRoom, leaveRoom, getRoom, getAllRooms, destroyRoom } from '../room'
import { createPlayerForAccount } from '../player'

describe('room lifecycle', () => {
  beforeEach(() => { for (const r of getAllRooms()) destroyRoom(r.code) })

  test('room is dissolved when the last human leaves', () => {
    const room = createRoom(6)
    const code = room.code
    joinRoom(code, createPlayerForAccount({ id: 'u1', username: 'a' }))
    expect(leaveRoom(code, 'u1')).toBeNull()
    expect(getRoom(code)).toBeUndefined()
  })

  test('room with only AI dissolves when the human leaves', () => {
    const room = createRoom(6)
    const code = room.code
    joinRoom(code, createPlayerForAccount({ id: 'u1', username: 'a' }))
    const ai = createPlayerForAccount({ id: 'ai1', username: '电脑1' })
    ai.isAI = true
    joinRoom(code, ai)
    expect(leaveRoom(code, 'u1')).toBeNull()
    expect(getRoom(code)).toBeUndefined()
  })

  test('room stays while a human remains', () => {
    const room = createRoom(6)
    const code = room.code
    joinRoom(code, createPlayerForAccount({ id: 'u1', username: 'a' }))
    joinRoom(code, createPlayerForAccount({ id: 'u2', username: 'b' }))
    expect(leaveRoom(code, 'u1')).toBe(getRoom(code))
    expect(getRoom(code)!.players.map(p => p.id)).toEqual(['u2'])
  })
})
