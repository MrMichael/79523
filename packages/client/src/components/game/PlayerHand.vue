<template>
  <div class="player-hand">
    <div class="hand-area">
      <CardSprite
        v-for="(card, i) in myHand" :key="`${card.suit}-${card.rank}-${i}`"
        :card="card" :selected="isSelected(card)" :dimmed="!isMyTurn" @select="onSelectCard(card)"
      />
    </div>
    <div class="actions">
      <button @click="onPlay" :disabled="!canPlay">出牌</button>
      <button @click="onPass" :disabled="!isMyTurn || mustPlay">过</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { identify } from '@79523/engine'
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'

const store = useGameStore()
const props = defineProps<{ myHand: Card[]; isMyTurn: boolean; mustPlay: boolean }>()
const emit = defineEmits<{ play: [cards: Card[]]; pass: [] }>()

function isSelected(card: Card) { return store.selectedCards.some(c => c.suit === card.suit && c.rank === card.rank) }
function onSelectCard(card: Card) { if (!props.isMyTurn) return; store.selectCard(card) }

const canPlay = computed(() => {
  if (!props.isMyTurn || store.selectedCards.length === 0) return false
  return identify(store.selectedCards) !== null
})

function onPlay() { if (!canPlay.value) return; emit('play', [...store.selectedCards]); store.clearSelection() }
function onPass() { if (props.mustPlay) return; emit('pass') }
</script>

<style scoped>
.player-hand { padding: 0.5rem; background: linear-gradient(to top, #1a1a2e, #16213e); }
.hand-area { display: flex; justify-content: center; gap: 2px; overflow-x: auto; padding: 0.5rem 0; }
.actions { display: flex; gap: 1rem; justify-content: center; padding: 0.5rem 0; }
button { padding: 0.6rem 2rem; font-size: 1rem; border-radius: 8px; border: none; cursor: pointer; }
button:first-child { background: #4CAF50; color: white; }
button:last-child { background: #f44336; color: white; }
button:disabled { background: #666; cursor: not-allowed; }
</style>
