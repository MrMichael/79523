<template>
  <div class="score-display">
    <div v-for="(score, id) in scores" :key="id" class="score-item">{{ playerNames[id] || id }}: {{ score }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ scores: Record<string, number>; playerNames: Record<string, string> }>()
</script>

<style scoped>
.score-display { display: flex; gap: 1rem; justify-content: center; padding: 0.5rem; font-size: 0.9rem; background: rgba(0,0,0,0.05); }
.score-item { font-weight: 600; }
</style>
