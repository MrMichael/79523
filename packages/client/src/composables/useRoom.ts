import { ref } from 'vue'
import { useSocket } from './useSocket'
import { useGame } from './useGame'
import { useGameStore } from '@/stores/game'
import type { PlayerInfo, ChatMessage } from '@/types'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/api'
import { useAuthStore } from '@/stores/auth'

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
  function leaveRoom() {
    socket.value?.emit('leave_room')
    // Keep listenersSetup=true: the socket object (and its listeners) survives, so we only
    // clear the room state here to avoid re-registering duplicate handlers.
    roomCode.value = ''
    players.value = []
    myId.value = ''
    router.push('/lobby')
  }
  function startGame() {
    socket.value?.emit('start_game')
  }
  function addAI() { socket.value?.emit('add_ai') }
  function fillAI() { socket.value?.emit('fill_ai') }
  function removeAI(id: string) { socket.value?.emit('remove_ai', { playerId: id }) }

  async function refreshRoom() {
    if (!roomCode.value) return
    try {
      const d = await apiFetch(`/api/rooms/${roomCode.value}`)
      players.value = d.players as PlayerInfo[]
      const auth = useAuthStore()
      myId.value = auth.user?.id || ''
    } catch { /* room no longer exists */ }
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
    socket.value?.on('full_state', ({ roomCode: code }: any) => {
      // A player who was offline when the host started the game missed `game_started`;
      // on reconnect the server sends full_state, so move them onto the game screen.
      const target = code || roomCode.value
      if (target && router.currentRoute.value.name !== 'game') router.push(`/game/${target}`)
    })
    socket.value?.on('players_updated', ({ players: plist }) => {
      players.value = plist as PlayerInfo[]
    })
    socket.value?.on('player_left', ({ players: plist }) => {
      players.value = plist as PlayerInfo[]
    })
    socket.value?.on('chat_message', (m: ChatMessage) => {
      useGameStore().addChat(m)
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
      // We no longer have a seat (e.g. the seat was reclaimed while we were offline) — go back
      // to the lobby instead of sitting on a room/game page we're not part of.
      if (message === 'Player not found' || message === 'Room not found' || message === '你不在该房间') {
        roomCode.value = ''
        players.value = []
        myId.value = ''
        router.push('/lobby')
      }
    })
  }

  function resetRoom() {
    roomCode.value = ''
    players.value = []
    myId.value = ''
    listenersSetup = false
  }

  return { roomCode, players, myId, createRoom, joinRoom, leaveRoom, startGame, addAI, fillAI, removeAI, setupListeners, resetRoom, refreshRoom }
}
