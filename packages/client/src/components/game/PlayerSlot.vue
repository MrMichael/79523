<template>
  <div class="player-slot" :class="{ active: isActive, highest: isHighest }" :style="color ? { borderColor: color } : undefined">
    <div class="name" :style="color ? { color } : undefined">{{ name }}{{ isHighest ? ' 👑' : '' }}</div>
    <div class="cards-face-down">
      <div v-for="i in cardCount" :key="i" class="card-back"></div>
    </div>
    <div class="score">{{ score }}分</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ name: string; cardCount: number; score: number; isActive: boolean; isHighest?: boolean; color?: string }>()
</script>

<style scoped>
.player-slot { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; border-radius: 10px; min-width: 70px; border: 1px solid transparent; }
.player-slot.active { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); }
.name { font-weight: 700; font-size: 0.85rem; color: #e2e8f0; }
.cards-face-down { display: flex; gap: 2px; justify-content: center; }
.card-back { width: 22px; height: 32px; background: linear-gradient(135deg, #1e3a5f, #3b82f6); border-radius: 3px; border: 1px solid #1e3a5f; }
.score { font-size: 0.75rem; color: #94a3b8; font-weight: 600; }
.player-slot.highest { background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); }
.player-slot.highest .score { color: #fbbf24; }
</style>
