import { describe, it, expect, vi } from 'vitest'

const { handlers, fakeSocket } = vi.hoisted(() => {
  const handlers: Record<string, (...a: any[]) => void> = {}
  const fakeSocket = {
    on: vi.fn((evt: string, fn: (...a: any[]) => void) => { handlers[evt] = fn }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }
  return { handlers, fakeSocket }
})

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket) }))
vi.mock('../api', () => ({ getToken: vi.fn(() => 'T') }))

import { useSocket, roomCodeFromPath } from '../composables/useSocket'

describe('roomCodeFromPath', () => {
  it('extracts the code from room/game paths', () => {
    expect(roomCodeFromPath('/room/AB12CD')).toBe('AB12CD')
    expect(roomCodeFromPath('/game/XY99')).toBe('XY99')
  })

  it('returns empty elsewhere', () => {
    expect(roomCodeFromPath('/lobby')).toBe('')
    expect(roomCodeFromPath('/')).toBe('')
  })
})

describe('useSocket reconnect', () => {
  it('re-binds the seat on connect when on a room/game path', () => {
    const { connect } = useSocket()
    connect()
    window.history.pushState({}, '', '/game/AB12CD')
    handlers['connect']?.()
    expect(fakeSocket.emit).toHaveBeenCalledWith('reconnect', { roomCode: 'AB12CD' })
  })
})
