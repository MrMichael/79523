<template>
  <div class="card" :class="[suitClass, { selected, dimmed }]" :style="accent ? { borderColor: accent } : undefined" @click="$emit('select')">
    <span class="rank">{{ rankLabel }}</span>
    <span class="suit">{{ suitLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Suit, Rank } from '@79523/engine'
import type { Card } from '@79523/engine'

const props = defineProps<{ card: Card; selected?: boolean; dimmed?: boolean; accent?: string }>()
defineEmits<{ select: [] }>()

const rankLabels: Record<number, string> = {
  [Rank.Four]: '4', [Rank.Six]: '6', [Rank.Eight]: '8', [Rank.Ten]: '10',
  [Rank.Jack]: 'J', [Rank.Queen]: 'Q', [Rank.King]: 'K', [Rank.Ace]: 'A',
  [Rank.Three]: '3', [Rank.Two]: '2', [Rank.Five]: '5', [Rank.Nine]: '9', [Rank.Seven]: '7',
}
const suitLabels: Record<number, string> = {
  [Suit.Spade]: '♠', [Suit.Heart]: '♥', [Suit.Club]: '♣', [Suit.Diamond]: '♦',
}
const rankLabel = computed(() => rankLabels[props.card.rank] ?? '?')
const suitLabel = computed(() => suitLabels[props.card.suit] ?? '?')
const suitClass = computed(() => {
  return props.card.suit === Suit.Heart || props.card.suit === Suit.Diamond ? 'suit-red' : 'suit-black'
})
</script>

<style scoped>
.card {
  width: 46px; height: 66px; border: 2px solid #334155; border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #f8fafc, #e2e8f0); cursor: pointer;
  user-select: none; transition: all 0.12s; flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}
.card.suit-red { color: #dc2626; }
.card.suit-black { color: #1e293b; }
.card.selected {
  transform: translateY(-14px);
  border-color: #fbbf24;
  box-shadow: 0 6px 16px rgba(251,191,36,0.35);
}
.card.dimmed { opacity: 0.45; cursor: not-allowed; }
.rank { font-size: 0.95rem; font-weight: 800; line-height: 1; }
.suit { font-size: 0.85rem; line-height: 1; }
</style>
