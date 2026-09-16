import { describe, test, expect, beforeEach } from '@jest/globals'
import { createRoom, joinRoom, leaveRoom, getRoom, getAllRooms, destroyRoom } from '../room'
import { createPlayerForAccount, createAIPlayer, getPlayer } from '../player'

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

  test('AI players are numbered inside their own room, not by a global counter', () => {
    const roomA = createRoom(6)
    joinRoom(roomA.code, createPlayerForAccount({ id: 'a1', username: 'a' }))
    const ai1 = createAIPlayer(roomA); joinRoom(roomA.code, ai1)
    const ai2 = createAIPlayer(roomA); joinRoom(roomA.code, ai2)
    expect([ai1.name, ai2.name]).toEqual(['电脑1', '电脑2'])

    const roomB = createRoom(6)
    joinRoom(roomB.code, createPlayerForAccount({ id: 'b1', username: 'b' }))
    // A brand new room starts from 电脑1 again, even though other rooms already made AIs.
    expect(createAIPlayer(roomB).name).toBe('电脑1')
  })

  test('dissolving a room drops its AI seats from the registry too', () => {
    const room = createRoom(6)
    const code = room.code
    joinRoom(code, createPlayerForAccount({ id: 'u1', username: 'a' }))
    const ai = createAIPlayer(room)
    joinRoom(code, ai)
    expect(getPlayer(ai.id)).toBeDefined()

    expect(leaveRoom(code, 'u1')).toBeNull() // last human out → dissolved
    expect(getRoom(code)).toBeUndefined()
    expect(getPlayer(ai.id)).toBeUndefined() // used to leak for the life of the process
  })

  test('destroyRoom drops its seats from the registry too', () => {
    const room = createRoom(6)
    joinRoom(room.code, createPlayerForAccount({ id: 'u9', username: 'z' }))
    const ai = createAIPlayer(room)
    joinRoom(room.code, ai)

    destroyRoom(room.code)
    expect(getPlayer('u9')).toBeUndefined()
    expect(getPlayer(ai.id)).toBeUndefined()
  })
})
