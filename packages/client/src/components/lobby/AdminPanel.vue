<template>
  <div class="admin">
    <h3>用户管理</h3>
    <div v-for="u in users" :key="u.id" class="admin-row">
      <span class="name">{{ u.username }}</span>
      <span class="role" :class="{ admin: u.role === 'admin' }">{{ u.role === 'admin' ? '管理员' : '用户' }}</span>
      <span class="stats">🏆{{ u.wins }} 🥊{{ u.boxerWins }}</span>
      <button @click="toggleRole(u)">{{ u.role === 'admin' ? '降为普通' : '设为管理员' }}</button>
      <button @click="reset(u)">重置战绩</button>
      <button class="danger" @click="del(u)">删除</button>
    </div>

    <h3>房间</h3>
    <div v-for="r in rooms" :key="r.code" class="admin-row">
      <span class="name">{{ r.code }} · {{ r.playerCount }}/{{ r.maxPlayers }}</span>
      <span class="role">{{ r.inGame ? '进行中' : '等待中' }}</span>
      <button class="danger" @click="closeRoom(r.code)">解散</button>
    </div>
    <p v-if="!users.length && !rooms.length" class="empty">暂无数据</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch } from '@/api'

const emit = defineEmits<{ roomsChanged: [] }>()
const users = ref<any[]>([])
const rooms = ref<any[]>([])

async function load() {
  users.value = await apiFetch('/api/admin/users')
  rooms.value = await apiFetch('/api/rooms')
}
onMounted(load)

async function toggleRole(u: any) {
  try {
    await apiFetch(`/api/admin/users/${u.id}/role`, { method: 'PUT', body: JSON.stringify({ role: u.role === 'admin' ? 'user' : 'admin' }) })
    await load()
  } catch (e: any) { alert(e.message) }
}
async function reset(u: any) {
  if (!confirm(`重置 ${u.username} 的战绩？`)) return
  await apiFetch(`/api/admin/users/${u.id}/reset`, { method: 'POST' })
  await load()
}
async function del(u: any) {
  if (!confirm(`删除用户 ${u.username}？（不可恢复）`)) return
  try { await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' }); await load() } catch (e: any) { alert(e.message) }
}
async function closeRoom(code: string) {
  if (!confirm(`解散房间 ${code}？`)) return
  await apiFetch(`/api/admin/rooms/${code}`, { method: 'DELETE' })
  await load()
  emit('roomsChanged')
}
</script>

<style scoped>
.admin { display: flex; flex-direction: column; gap: 0.4rem; }
h3 { font-size: 0.85rem; color: #94a3b8; margin: 0.6rem 0 0.2rem; }
.admin-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem; background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 0.82rem; }
.name { flex: 1; color: #e2e8f0; }
.role { font-size: 0.72rem; color: #94a3b8; }
.role.admin { color: #fbbf24; }
.stats { color: #94a3b8; font-size: 0.75rem; }
button { padding: 0.25rem 0.6rem; font-size: 0.72rem; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; background: rgba(255,255,255,0.06); color: #cbd5e1; cursor: pointer; }
button.danger { border-color: rgba(239,68,68,0.4); color: #f87171; background: rgba(239,68,68,0.1); }
.empty { color: #475569; text-align: center; padding: 0.5rem; }
</style>
