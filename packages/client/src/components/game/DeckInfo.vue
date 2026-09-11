<template>
  <div class="deck-info">
    <span class="deck-icon">🂠</span> 牌堆剩余 <strong>{{ count }}</strong> 张
  </div>
</template>

<script setup lang="ts">
defineProps<{ count: number }>()
</script>

<style scoped>
.deck-info {
  display: inline-flex; align-items: center; gap: 0.35rem; align-self: center;
  padding: 0.25rem 0.75rem; border-radius: 999px;
  background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.25);
  font-size: 0.85rem; color: #fbbf24; font-weight: 600;
}
.deck-info strong { font-size: 1rem; }
.deck-icon { font-size: 0.8rem; }
</style>
