<template>
  <div class="player-slot" :class="{ active: isActive }">
    <div class="name">{{ name }}</div>
    <div class="cards-face-down">
      <div v-for="i in cardCount" :key="i" class="card-back"></div>
    </div>
    <div class="score">{{ score }}分</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ name: string; cardCount: number; score: number; isActive: boolean }>()
</script>

<style scoped>
.player-slot { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.5rem; border-radius: 8px; }
.player-slot.active { background: rgba(76, 175, 80, 0.15); box-shadow: 0 0 8px rgba(76, 175, 80, 0.3); }
.name { font-weight: bold; font-size: 0.9rem; }
.cards-face-down { display: flex; gap: 2px; }
.card-back { width: 24px; height: 34px; background: linear-gradient(135deg, #1a5276, #2980b9); border-radius: 3px; border: 1px solid #1a5276; }
.score { font-size: 0.8rem; color: #666; }
</style>
