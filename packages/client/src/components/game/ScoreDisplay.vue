<template>
  <div class="score-display">
    <div v-for="(score, id) in scores" :key="id" class="score-item">
      <span class="score-name">{{ playerNames[id] || id }}</span>
      <span class="score-value">{{ score }} 分</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ scores: Record<string, number>; playerNames: Record<string, string> }>()
</script>

<style scoped>
.score-display {
  display: flex; gap: 0.75rem; justify-content: center; padding: 0.4rem 0.5rem;
  background: rgba(0,0,0,0.04); border-radius: 8px;
}
.score-item {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.9rem; font-weight: 600; padding: 0.3rem 0.6rem;
  background: white; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.score-name { color: #555; }
.score-value { color: #ff6f00; font-weight: 700; }
</style>
