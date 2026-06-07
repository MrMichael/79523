<template>
  <div class="turn" :class="{ active: isMyTurn }">
    <span v-if="isMyTurn" class="turn-label">⏱ 你的回合</span>
    <span v-else class="turn-label waiting">等待 {{ currentPlayer }} 出牌</span>
    <span v-if="isMyTurn" class="timer">{{ timeLeft }}s</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ isMyTurn: boolean; currentPlayer: string; timeLeft: number }>()
</script>

<style scoped>
.turn { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.3rem; }
.turn-label { font-size: 0.9rem; font-weight: 600; }
.turn.active .turn-label { color: #fbbf24; }
.waiting { color: #64748b; }
.timer { background: rgba(251,191,36,0.15); color: #fbbf24; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
</style>
