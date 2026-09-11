import { describe, test, expect, beforeEach } from '@jest/globals'
import { createRoom, joinRoom, leaveRoom, getRoom, getAllRooms, destroyRoom, cleanupStaleRooms } from '../room'
import { createPlayerForAccount } from '../player'

describe('room lifecycle', () => {
  beforeEach(() => { for (const r of getAllRooms()) destroyRoom(r.code) })

  test('room with no humans is retained then cleaned after 10min', () => {
    const room = createRoom(6)
    joinRoom(room.code, createPlayerForAccount({ id: 'u1', username: 'a' }))
    leaveRoom(room.code, 'u1')
    const afterLeave = getRoom(room.code)
    expect(afterLeave).toBeDefined()
    expect(afterLeave!.emptiedAt).toBeGreaterThan(0)
    afterLeave!.emptiedAt = Date.now() - 11 * 60 * 1000
    cleanupStaleRooms()
    expect(getRoom(room.code)).toBeUndefined()
  })

  test('room with only AI is treated as empty', () => {
    const room = createRoom(6)
    const ai = createPlayerForAccount({ id: 'ai1', username: '电脑1' })
    ai.isAI = true
    joinRoom(room.code, ai)
    room.emptiedAt = Date.now() - 11 * 60 * 1000
    cleanupStaleRooms()
    expect(getRoom(room.code)).toBeUndefined()
  })

  test('occupied room is never cleaned', () => {
    const room = createRoom(6)
    joinRoom(room.code, createPlayerForAccount({ id: 'u2', username: 'b' }))
    room.emptiedAt = Date.now() - 11 * 60 * 1000
    cleanupStaleRooms()
    expect(getRoom(room.code)).toBe(room)
  })
})
