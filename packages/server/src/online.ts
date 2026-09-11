import type { Server } from 'socket.io'
import type { ClientEvents, ServerEvents } from './types'

let ioRef: Server<ClientEvents, ServerEvents> | null = null
const socketsByUser = new Map<string, Set<string>>()

export function bindOnline(io: Server<ClientEvents, ServerEvents>) { ioRef = io }
export function isOnline(userId: string): boolean { return (socketsByUser.get(userId)?.size ?? 0) > 0 }

export function markOnline(userId: string, socketId: string) {
  const set = socketsByUser.get(userId) || new Set<string>()
  set.add(socketId)
  socketsByUser.set(userId, set)
}
export function markOffline(userId: string, socketId: string) {
  const set = socketsByUser.get(userId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) socketsByUser.delete(userId)
}

export function kickUser(userId: string) {
  const set = socketsByUser.get(userId)
  if (!set || !ioRef) return
  for (const sid of [...set]) ioRef.sockets.sockets.get(sid)?.disconnect(true)
}
export function kickUserEverywhere(userId: string) { kickUser(userId) }
