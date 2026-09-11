<template>
  <div class="user-list">
    <div v-for="u in users" :key="u.id" class="user-item">
      <span class="dot" :class="{ online: u.online }"></span>
      <span class="name">{{ u.username }}</span>
      <span class="role" v-if="u.role === 'admin'">管理员</span>
      <span class="stats">🏆 {{ u.wins }} &nbsp; 🥊 {{ u.boxerWins }}</span>
    </div>
    <p v-if="!users.length" class="empty">暂无用户</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ users: { id: string; username: string; role: string; wins: number; boxerWins: number; online: boolean }[] }>()
</script>

<style scoped>
.user-list { display: flex; flex-direction: column; gap: 0.4rem; }
.user-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem;
  background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 0.85rem;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #475569; flex-shrink: 0; }
.dot.online { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
.name { flex: 1; color: #e2e8f0; font-weight: 500; }
.role { font-size: 0.68rem; color: #fbbf24; border: 1px solid rgba(251,191,36,0.4); border-radius: 4px; padding: 0 0.3rem; }
.stats { color: #94a3b8; font-size: 0.78rem; }
.empty { color: #475569; text-align: center; padding: 0.5rem; }
</style>
