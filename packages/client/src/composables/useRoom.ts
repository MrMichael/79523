import { ref } from 'vue'
import { useSocket } from './useSocket'
import { useGame } from './useGame'
import { useGameStore } from '@/stores/game'
import type { PlayerInfo } from '@/types'
import { useRouter } from 'vue-router'

// Module-level shared state — survives route changes
const roomCode = ref('')
const players = ref<PlayerInfo[]>([])
const amReady = ref(false)
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

  function createRoom(playerName: string, maxPlayers: number) {
    socket.value?.emit('create_room', { name: playerName, maxPlayers })
  }
  function joinRoom(code: string, playerName: string) {
    roomCode.value = code
    socket.value?.emit('join_room', { roomCode: code, playerName })
    router.push(`/room/${code}`)
  }
  function ready() {
    amReady.value = true
    socket.value?.emit('ready')
  }
  function startNewGame() {
    amReady.value = false
    socket.value?.emit('start_new_game')
  }

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
      rlog('players_updated', `ready=${plist.filter((p:any)=>p.ready).length}/${plist.length}`)
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
      amReady.value = false
      router.push(`/room/${roomCode.value}`)
      // Auto-trigger new game setup — host resets room, others just see leaderboard
      setTimeout(() => {
        if (players.value.some(p => p.id === myId.value && p.isHost)) {
          socket.value?.emit('start_new_game')
        }
      }, 500)
    })
    socket.value?.on('error', ({ message }) => {
      console.error(message)
      const gameStore = useGameStore()
      gameStore.errorMessage = message
      setTimeout(() => { gameStore.clearError() }, 1000)
    })
  }

  function resetRoom() {
    roomCode.value = ''
    players.value = []
    amReady.value = false
    myId.value = ''
    listenersSetup = false
  }

  return { roomCode, players, amReady, myId, createRoom, joinRoom, ready, startNewGame, setupListeners, resetRoom }
}
