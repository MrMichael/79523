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
        // Always ask the server to restore our seat. The URL may carry no room code (the page
        // reloaded onto the lobby) while this account is still sitting in a game — without this
        // the player only gets back in after a manual refresh.
        const code = roomCodeFromPath(window.location.pathname)
        socket.value?.emit('reconnect', code ? { roomCode: code } : {})
      })
    }
    return socket.value
  }
  function sendChat(text: string) { socket.value?.emit('chat', { text }) }
  function disconnect() { socket.value?.disconnect(); socket.value = null }
  return { socket, connect, disconnect, sendChat }
}
