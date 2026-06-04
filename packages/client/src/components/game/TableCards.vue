<template>
  <div class="table-cards">
    <CardSprite v-for="(card, i) in cards" :key="`t-${i}`" :card="card" />
  </div>
</template>

<script setup lang="ts">
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'
defineProps<{ cards: Card[] }>()
</script>

<style scoped>
.table-cards { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; min-height: 72px; padding: 0.5rem; }
</style>
