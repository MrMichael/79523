import { ref } from 'vue'
import { useSocket, roomCodeFromPath } from './useSocket'
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
/** A game is running in this room — joiners are seated for the NEXT game. */
const inGame = ref(false)
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
    inGame.value = false
    router.push('/lobby')
  }
  function startGame() {
    socket.value?.emit('start_game')
  }
  /** Manual 托管: the server plays my seat until I turn it off. */
  function setManaged(managed: boolean) {
    socket.value?.emit('set_managed', { managed })
  }
  /**
   * Ask the server for the state of my seat. Fired whenever the room/game view mounts (and after a
   * reconnect), so a client that missed an event — or just landed on a screen — is always in step
   * and never needs a manual browser refresh.
   */
  function requestSync() {
    const code = roomCode.value || roomCodeFromPath(window.location.pathname)
    socket.value?.emit('sync_me', code ? { roomCode: code } : {})
  }
  function addAI() { socket.value?.emit('add_ai') }
  function fillAI() { socket.value?.emit('fill_ai') }
  function removeAI(id: string) { socket.value?.emit('remove_ai', { playerId: id }) }

  async function refreshRoom() {
    if (!roomCode.value) return
    try {
      const d = await apiFetch(`/api/rooms/${roomCode.value}`)
      players.value = d.players as PlayerInfo[]
      inGame.value = !!d.inGame
      const auth = useAuthStore()
      myId.value = auth.user?.id || ''
    } catch { /* room no longer exists */ }
  }

  function setupListeners() {
    // Don't latch before there is a socket: calling this early (e.g. from App's setup, which runs
    // before any view creates the connection) used to set the flag with nothing registered, so the
    // later, real call was skipped and the room/game events had no handler at all.
    if (!socket.value) return
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
      inGame.value = true
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
    // Someone came back mid-game — announce it on the bullet line so the table notices.
    socket.value?.on('player_reconnected', ({ playerId, name }: { playerId: string; name?: string }) => {
      const meId = useAuthStore().user?.id
      if (playerId === meId) return
      const who = name || players.value.find(p => p.id === playerId)?.name
      if (who) useGameStore().pushNotice(`${who} 上线了`)
    })
    socket.value?.on('game_started', ({ myId: id, roomCode: code }: any) => {
      if (id) myId.value = id
      // 用房号跳转不能拿本地状态（在大厅时它是空的）——服务端现在会随事件带上房号
      if (code) roomCode.value = code
      inGame.value = true
      if (roomCode.value) router.push(`/game/${roomCode.value}`)
    })
    socket.value?.on('next_game_lead', () => {
      rlog('next_game_lead')
      inGame.value = false
      router.push(`/room/${roomCode.value}`)
    })
    socket.value?.on('error', ({ message, notInRoom }: any) => {
      console.error(message)
      const gameStore = useGameStore()
      gameStore.errorMessage = message
      setTimeout(() => { gameStore.clearError() }, 1500)
      // The server flagged this as "you have no seat here" — go back to the lobby instead of
      // sitting on a room/game page we are not part of. This is what used to leave a player who
      // was refused a join (game already started / room gone) stranded, looking at the table
      // but unable to do anything ("join room never works").
      if (notInRoom) {
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
    inGame.value = false
    listenersSetup = false
  }

  return { roomCode, players, myId, inGame, createRoom, joinRoom, leaveRoom, startGame, setManaged, requestSync, addAI, fillAI, removeAI, setupListeners, resetRoom, refreshRoom }
}
