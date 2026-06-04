<template>
  <div class="deck-info">剩余: {{ count }} 张</div>
</template>

<script setup lang="ts">
defineProps<{ count: number }>()
</script>

<style scoped>
.deck-info { text-align: center; padding: 0.25rem; font-size: 0.85rem; color: #666; }
</style>
