import { io, Socket } from 'socket.io-client'
import { ref } from 'vue'
import { getToken } from '../api'

const socket = ref<Socket | null>(null)

/** Room/game code from a URL path, so a (re)connection can re-bind the server-side seat. */
export function roomCodeFromPath(path: string): string {
  const m = /^\/(?:room|game)\/([A-Za-z0-9]+)/.exec(path)
  return m ? m[1] : ''
}

export function useSocket() {
  function connect() {
    if (!socket.value) {
      socket.value = io('/', { transports: ['websocket', 'polling'], auth: { token: getToken() } })
      // After a reconnect (mobile background / page reload) tell the server to re-bind our
      // seat, otherwise it keeps emitting turns to the previous, now-dead socket.
      socket.value.on('connect', () => {
        const code = roomCodeFromPath(window.location.pathname)
        if (code) socket.value?.emit('reconnect', { roomCode: code })
      })
    }
    return socket.value
  }
  function disconnect() { socket.value?.disconnect(); socket.value = null }
  return { socket, connect, disconnect }
}
