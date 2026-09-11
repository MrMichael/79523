<template>
  <div class="table-cards" :class="{ empty: cards.length === 0 }">
    <div v-if="cards.length === 0" class="empty-hint">桌面</div>
    <template v-else-if="plays && plays.length">
      <div
        v-for="(play, pi) in plays"
        :key="`p-${pi}`"
        class="play-group"
        :style="{ borderColor: colorOf(play.playerId) }"
      >
        <CardSprite v-for="(card, i) in play.cards" :key="`g-${pi}-${i}`" :card="card" :accent="colorOf(play.playerId)" />
      </div>
    </template>
    <CardSprite v-else v-for="(card, i) in cards" :key="`t-${i}`" :card="card" />
  </div>
</template>

<script setup lang="ts">
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'
const props = defineProps<{
  cards: Card[]
  plays?: { playerId: string; cards: Card[] }[]
  colorMap?: Record<string, string>
}>()
function colorOf(id: string) { return props.colorMap?.[id] || '#64748b' }
</script>

<style scoped>
.table-cards { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; min-height: 72px; padding: 0.5rem; align-items: center; }
.empty-hint { color: #334155; font-size: 0.85rem; }
.play-group { display: flex; gap: 3px; padding: 2px 4px; border-left: 3px solid #64748b; border-radius: 4px; }
</style>
