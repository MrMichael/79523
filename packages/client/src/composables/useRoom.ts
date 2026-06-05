import { ref } from 'vue'
import { useSocket } from './useSocket'
import type { PlayerInfo } from '@/types'
import { useRouter } from 'vue-router'

let listenersSetup = false

export function useRoom() {
  const { socket } = useSocket()
  const router = useRouter()
  const roomCode = ref('')
  const players = ref<PlayerInfo[]>([])
  const amReady = ref(false)

  function createRoom(playerName: string, maxPlayers: number) {
    socket.value?.emit('create_room', { name: playerName, maxPlayers })
  }
  function joinRoom(code: string, playerName: string) {
    roomCode.value = code
    socket.value?.emit('join_room', { roomCode: code, playerName })
  }
  function ready() { socket.value?.emit('ready'); amReady.value = true }

  function setupListeners() {
    if (listenersSetup) return
    listenersSetup = true

    socket.value?.on('room_created', ({ roomCode: code }) => { roomCode.value = code; router.push(`/room/${code}`) })
    socket.value?.on('player_joined', () => { router.push(`/room/${roomCode.value}`) })
    socket.value?.on('player_left', ({ players: plist }) => { players.value = plist as PlayerInfo[] })
    socket.value?.on('game_started', () => { router.push(`/game/${roomCode.value}`) })
    socket.value?.on('error', ({ message }) => { console.error(message) })
  }

  return { roomCode, players, amReady, createRoom, joinRoom, ready, setupListeners }
}
