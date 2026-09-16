<template>
  <div class="lobby">
    <nav class="tabs">
      <button :class="{ active: tab === 'hall' }" @click="tab = 'hall'">大厅</button>
      <button :class="{ active: tab === 'rank' }" @click="tab = 'rank'">全局排名</button>
      <button v-if="auth.isAdmin" :class="{ active: tab === 'admin' }" @click="tab = 'admin'">管理</button>
      <span class="spacer" />
      <span class="me">{{ auth.user?.username }}<span v-if="auth.isAdmin" class="admin-tag"> · 管理员</span></span>
      <RefreshButton />
      <button class="logout" @click="onLogout">登出</button>
    </nav>

    <div v-if="tab === 'hall'" class="hall">
      <section class="panel">
        <div class="panel-head">
          <h3>房间</h3>
          <button class="create" @click="createRoom">创建房间</button>
        </div>
        <div class="join-row">
          <input v-model="joinCode" maxlength="6" placeholder="输入 6 位房号"
            @input="joinCode = joinCode.toUpperCase()" @keyup.enter="joinByCode" />
          <button @click="joinByCode">加入</button>
        </div>
        <RoomList :rooms="roomsView" @join="joinRoom" />
      </section>
      <section class="panel">
        <h3>用户</h3>
        <UserList :users="users" />
      </section>
    </div>

    <div v-else-if="tab === 'rank'" class="panel">
      <h3>全局排名</h3>
      <Leaderboard />
    </div>

    <div v-else-if="tab === 'admin'" class="panel">
      <h3>管理</h3>
      <AdminPanel @rooms-changed="refreshRooms" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSocket } from '@/composables/useSocket'
import { useRoom } from '@/composables/useRoom'
import RoomList from '@/components/lobby/RoomList.vue'
import UserList from '@/components/lobby/UserList.vue'
import Leaderboard from '@/components/lobby/Leaderboard.vue'
import AdminPanel from '@/components/lobby/AdminPanel.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'

const auth = useAuthStore()
const router = useRouter()
const { socket, connect } = useSocket()
// 在这里（socket 刚建立时）就把房间/对局监听器挂上：玩家可能停在大厅时被开局，
// 若等 RoomView 挂载再注册，那一瞬间的 game_started 会直接丢掉。
const { setupListeners } = useRoom()
const tab = ref<'hall' | 'rank' | 'admin'>('hall')
const users = ref<any[]>([])
const rooms = ref<any[]>([])
const joinCode = ref('')
let pendingJoin = ''

const roomsView = computed(() =>
  rooms.value.map(r => ({ ...r, hostName: users.value.find(u => u.id === r.hostId)?.username || '—' }))
)

async function refreshUsers() { users.value = await apiFetch('/api/users') }
async function refreshRooms() { rooms.value = await apiFetch('/api/rooms') }
function createRoom() { socket.value?.emit('create_room') }
function joinRoom(code: string) { pendingJoin = code; socket.value?.emit('join_room', { roomCode: code }) }
function joinByCode() { if (joinCode.value.length === 6) joinRoom(joinCode.value) }
function onLogout() { auth.logout(); router.push('/login') }

function onRoomCreated(d: any) { router.push(`/room/${d.roomCode}`) }
function onPlayerJoined() { if (pendingJoin) router.push(`/room/${pendingJoin}`) }
function onLobbyUsers(d: any) { users.value = d.users }
function onLobbyRooms(d: any) { rooms.value = d.rooms }
function onSocketConnect() { refreshUsers().catch(() => {}); refreshRooms().catch(() => {}) }

onMounted(async () => {
  connect()
  setupListeners()
  // Attach lobby listeners immediately so we don't miss the on-connect broadcast.
  socket.value?.on('lobby_users_updated', onLobbyUsers)
  socket.value?.on('lobby_rooms_updated', onLobbyRooms)
  socket.value?.on('room_created', onRoomCreated)
  socket.value?.on('player_joined', onPlayerJoined)
  socket.value?.on('connect', onSocketConnect)
  await auth.loadMe()
  if (!auth.isLoggedIn) { router.push('/login'); return }
  try { await Promise.all([refreshUsers(), refreshRooms()]) } catch { /* apiFetch redirects on 401 */ }
})

onUnmounted(() => {
  socket.value?.off('lobby_users_updated', onLobbyUsers)
  socket.value?.off('lobby_rooms_updated', onLobbyRooms)
  socket.value?.off('room_created', onRoomCreated)
  socket.value?.off('player_joined', onPlayerJoined)
  socket.value?.off('connect', onSocketConnect)
})
</script>

<style scoped>
.lobby { display: flex; flex-direction: column; height: 100%; padding: 1rem; gap: 1rem; }
.tabs { display: flex; align-items: center; gap: 0.4rem; }
.tabs button {
  padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; background: rgba(255,255,255,0.04); color: #94a3b8; cursor: pointer;
}
.tabs button.active { border-color: #fbbf24; color: #fbbf24; background: rgba(251,191,36,0.12); }
.spacer { flex: 1; }
.me { font-size: 0.82rem; color: #cbd5e1; }
.admin-tag { color: #fbbf24; }
.logout { padding: 0.35rem 0.7rem !important; font-size: 0.78rem !important; }
.hall { display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; }
.panel {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;
}
.panel-head { display: flex; align-items: center; justify-content: space-between; }
h3 { font-size: 0.9rem; color: #94a3b8; }
.create {
  padding: 0.4rem 0.9rem; font-size: 0.8rem; font-weight: 600; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1a1a1a; cursor: pointer;
}
.join-row { display: flex; gap: 0.5rem; }
.join-row input {
  flex: 1; padding: 0.5rem 0.7rem; font-size: 0.9rem; letter-spacing: 0.15em; text-align: center;
  text-transform: uppercase; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
  background: rgba(255,255,255,0.06); color: #e2e8f0; outline: none;
}
.join-row button {
  padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; cursor: pointer;
}
</style>
