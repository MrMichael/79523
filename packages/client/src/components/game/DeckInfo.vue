<template>
  <div class="deck-info">
    <span class="deck-icon">🂠</span> 剩余 {{ count }} 张
  </div>
</template>

<script setup lang="ts">
defineProps<{ count: number }>()
</script>

<style scoped>
.deck-info { text-align: center; padding: 0.2rem; font-size: 0.8rem; color: #475569; font-weight: 500; }
.deck-icon { font-size: 0.75rem; }
</style>
