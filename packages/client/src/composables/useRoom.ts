import { ref } from 'vue'
import { useSocket } from './useSocket'
import { useGame } from './useGame'
import { useGameStore } from '@/stores/game'
import type { PlayerInfo } from '@/types'
import { useRouter } from 'vue-router'

// Module-level shared state — survives route changes
const roomCode = ref('')
const players = ref<PlayerInfo[]>([])
const myId = ref('')
let listenersSetup = false

const rlog = (evt: string, detail?: any) => {
  const extra = detail ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 120)) : ''
  console.log(`[ROOM] ${evt}${extra}`)
}

export function useRoom() {
  const { socket } = useSocket()
  const { setupListeners: setupGameListeners } = useGame()
  const router = useRouter()

  function createRoom() {
    socket.value?.emit('create_room')
  }
  function joinRoom(code: string) {
    roomCode.value = code
    socket.value?.emit('join_room', { roomCode: code })
    router.push(`/room/${code}`)
  }
  function startGame() {
    socket.value?.emit('start_game')
  }
  function addAI() { socket.value?.emit('add_ai') }
  function fillAI() { socket.value?.emit('fill_ai') }
  function removeAI(id: string) { socket.value?.emit('remove_ai', { playerId: id }) }

  function setupListeners() {
    if (listenersSetup) return
    listenersSetup = true
    setupGameListeners()

    socket.value?.on('room_created', ({ roomCode: code }) => {
      rlog('room_created', code)
      roomCode.value = code
      router.push(`/room/${code}`)
    })
    socket.value?.on('player_joined', ({ players: plist }) => {
      rlog('player_joined', `n=${plist.length}`)
      players.value = plist as PlayerInfo[]
    })
    socket.value?.on('players_updated', ({ players: plist }) => {
      players.value = plist as PlayerInfo[]
    })
    socket.value?.on('player_left', ({ players: plist }) => {
      players.value = plist as PlayerInfo[]
    })
    socket.value?.on('game_started', ({ myId: id }: any) => {
      if (id) myId.value = id
      router.push(`/game/${roomCode.value}`)
    })
    socket.value?.on('next_game_lead', () => {
      rlog('next_game_lead')
      router.push(`/room/${roomCode.value}`)
    })
    socket.value?.on('error', ({ message }) => {
      console.error(message)
      const gameStore = useGameStore()
      gameStore.errorMessage = message
      setTimeout(() => { gameStore.clearError() }, 1500)
    })
  }

  function resetRoom() {
    roomCode.value = ''
    players.value = []
    myId.value = ''
    listenersSetup = false
  }

  return { roomCode, players, myId, createRoom, joinRoom, startGame, addAI, fillAI, removeAI, setupListeners, resetRoom }
}
