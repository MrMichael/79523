<template>
  <div class="card" :class="{ selected, dimmed }" @click="$emit('select')">
    <span class="rank">{{ rankLabel }}</span>
    <span class="suit">{{ suitLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Suit, Rank } from '@79523/engine'
import type { Card } from '@79523/engine'

const props = defineProps<{ card: Card; selected?: boolean; dimmed?: boolean }>()
defineEmits<{ select: [] }>()

const rankLabels: Record<number, string> = {
  [Rank.Four]: '4', [Rank.Six]: '6', [Rank.Eight]: '8', [Rank.Ten]: '10',
  [Rank.Jack]: 'J', [Rank.Queen]: 'Q', [Rank.King]: 'K', [Rank.Ace]: 'A',
  [Rank.Three]: '3', [Rank.Two]: '2', [Rank.Five]: '5', [Rank.Nine]: '9', [Rank.Seven]: '7',
}
const suitLabels: Record<number, string> = {
  [Suit.Spade]: '♠', [Suit.Heart]: '♥', [Suit.Club]: '♣', [Suit.Diamond]: '♦',
}
const rankLabel = computed(() => rankLabels[props.card.rank])
const suitLabel = computed(() => suitLabels[props.card.suit])
</script>

<style scoped>
.card {
  width: 48px; height: 68px; border: 2px solid #333; border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: white; cursor: pointer; user-select: none; transition: transform 0.1s; flex-shrink: 0;
}
.card.selected { transform: translateY(-12px); border-color: #FFD700; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
.card.dimmed { opacity: 0.5; cursor: not-allowed; }
.rank { font-size: 1rem; font-weight: bold; }
.suit { font-size: 0.9rem; }
</style>
