import { describe, test, expect, beforeEach } from '@jest/globals'
import { createRoom, getRoom, getAllRooms, joinRoom, leaveRoom, destroyRoom, setRoomGame } from '../room'
import { createPlayer, getPlayer } from '../player'
import type { Player } from '../types'

function makePlayer(id: string, name = 'Tester'): Player {
  return { id, name, socketId: `socket_${id}`, ready: false, connected: true, isHost: false, wins: 0, boxerWins: 0 }
}

describe('Room operations', () => {
  beforeEach(() => {
    // Clean up all rooms between tests
    const all = getAllRooms()
    for (const r of all) destroyRoom(r.code)
  })

  describe('createRoom', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      test(`creates room with maxPlayers=${n}`, () => {
        const room = createRoom(n)
        expect(room.code).toMatch(/^[A-Z0-9]{6}$/)
        expect(room.maxPlayers).toBe(n)
        expect(room.players).toHaveLength(0)
        expect(room.game).toBeNull()
        expect(getRoom(room.code)).toBe(room)
      })
    }

    test('each room gets unique code', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 20; i++) codes.add(createRoom(4).code)
      expect(codes.size).toBe(20)
    })
  })

  describe('joinRoom', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      test(`fills room to capacity (${n}p)`, () => {
        const room = createRoom(n)
        for (let i = 0; i < n; i++) {
          const p = makePlayer(`p${i + 1}`)
          const result = joinRoom(room.code, p)
          expect(result).toBe(room)
        }
        expect(room.players).toHaveLength(n)
      })

      test(`rejects player ${n + 1} when room full (${n}p)`, () => {
        const room = createRoom(n)
        for (let i = 0; i < n; i++) {
          joinRoom(room.code, makePlayer(`p${i + 1}`))
        }
        const overflow = joinRoom(room.code, makePlayer('overflow'))
        expect(overflow).toBeNull()
      })

      test(`duplicate join returns room (${n}p)`, () => {
        const room = createRoom(n)
        const p = makePlayer('p1')
        joinRoom(room.code, p)
        expect(joinRoom(room.code, p)).toBe(room)
        expect(room.players).toHaveLength(1) // no duplicate
      })
    }

    test('returns null for non-existent room', () => {
      expect(joinRoom('XXXXXX', makePlayer('p1'))).toBeNull()
    })
  })

  describe('leaveRoom', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      test(`player leaves a ${n}p room`, () => {
        const room = createRoom(n)
        for (let i = 0; i < n; i++) {
          joinRoom(room.code, makePlayer(`p${i + 1}`))
        }
        const result = leaveRoom(room.code, 'p1')
        expect(result).toBe(room)
        expect(room.players).toHaveLength(n - 1)
        expect(room.players.find(p => p.id === 'p1')).toBeUndefined()
      })

      test(`last player leaves ${n}p room → room dissolved`, () => {
        const room = createRoom(n)
        joinRoom(room.code, makePlayer('p1'))
        const result = leaveRoom(room.code, 'p1')
        expect(result).toBeNull()
        expect(getRoom(room.code)).toBeUndefined()
      })
    }

    test('returns null for non-existent room', () => {
      expect(leaveRoom('XXXXXX', 'p1')).toBeNull()
    })
  })

  describe('getRoom / getAllRooms', () => {
    test('getRoom returns undefined for missing room', () => {
      expect(getRoom('XXXXXX')).toBeUndefined()
    })

    test('getAllRooms returns all active rooms', () => {
      createRoom(2)
      createRoom(4)
      createRoom(6)
      expect(getAllRooms()).toHaveLength(3)
    })
  })

  describe('destroyRoom', () => {
    test('removes room from registry', () => {
      const room = createRoom(4)
      destroyRoom(room.code)
      expect(getRoom(room.code)).toBeUndefined()
    })
  })

  describe('setRoomGame', () => {
    test('sets game on room', () => {
      const room = createRoom(4)
      const mockGame = { phase: 'Playing' } as any
      setRoomGame(room.code, mockGame)
      expect(room.game).toBe(mockGame)
    })

    test('no-op for non-existent room', () => {
      expect(() => setRoomGame('XXXXXX', {} as any)).not.toThrow()
    })
  })

  describe('cleanupStaleRooms (removed: empty rooms dissolve immediately)', () => {
    test('an occupied room is not affected', () => {
      const room = createRoom(4)
      joinRoom(room.code, makePlayer('p1'))
      leaveRoom(room.code, 'p2') // p2 was never in it — no-op
      expect(getRoom(room.code)).toBe(room)
    })
  })
})

describe('Player operations', () => {
  test('createPlayer sets defaults', () => {
    const p = createPlayer('sock1', 'Alice')
    expect(p.name).toBe('Alice')
    expect(p.ready).toBe(false)
    expect(p.connected).toBe(true)
    expect(p.isHost).toBe(false)
    expect(p.wins).toBe(0)
    expect(p.boxerWins).toBe(0)
  })

  test('createPlayer with isHost', () => {
    const p = createPlayer('sock1', 'Host', true)
    expect(p.isHost).toBe(true)
  })

  test('getPlayer returns player', () => {
    const p = createPlayer('sock1', 'Alice')
    expect(getPlayer(p.id)).toBe(p)
  })

  test('getPlayer returns undefined for unknown', () => {
    expect(getPlayer('unknown')).toBeUndefined()
  })
})
