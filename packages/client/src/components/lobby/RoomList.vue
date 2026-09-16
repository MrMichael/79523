<template>
  <div class="room-list">
    <div v-for="r in rooms" :key="r.code" class="room-item">
      <span class="code">{{ r.code }}</span>
      <span class="host">{{ r.hostName }}</span>
      <span class="count">{{ r.playerCount }}/{{ r.maxPlayers }}</span>
      <span class="state" :class="{ live: r.inGame }">{{ r.inGame ? '进行中' : '等待中' }}</span>
      <button :disabled="r.playerCount >= r.maxPlayers" @click="$emit('join', r.code)">{{ r.inGame ? '等下一局' : '加入' }}</button>
    </div>
    <p v-if="!rooms.length" class="empty">暂无房间</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ rooms: { code: string; hostName: string; playerCount: number; maxPlayers: number; inGame: boolean }[] }>()
defineEmits<{ join: [code: string] }>()
</script>

<style scoped>
.room-list { display: flex; flex-direction: column; gap: 0.5rem; }
.room-item {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
}
.code { font-weight: 700; letter-spacing: 0.1em; color: #fbbf24; }
.host { flex: 1; color: #cbd5e1; font-size: 0.85rem; }
.count { color: #94a3b8; font-size: 0.8rem; }
.state { font-size: 0.75rem; color: #22c55e; }
.state.live { color: #64748b; }
button {
  padding: 0.35rem 0.9rem; font-size: 0.8rem; font-weight: 600; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #22c55e, #16a34a); color: white; cursor: pointer;
}
button:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
.empty { color: #475569; font-size: 0.85rem; text-align: center; padding: 0.5rem; }
</style>
