import { io, Socket } from 'socket.io-client'
import { ref } from 'vue'
import { getToken } from '../api'

const socket = ref<Socket | null>(null)

export function useSocket() {
  function connect() {
    if (!socket.value) {
      socket.value = io('/', { transports: ['websocket', 'polling'], auth: { token: getToken() } })
    }
    return socket.value
  }
  function disconnect() { socket.value?.disconnect(); socket.value = null }
  return { socket, connect, disconnect }
}
