<template>
  <div class="player-hand">
    <div ref="handArea" class="hand-area">
      <CardSprite
        v-for="(card, i) in myHand" :key="`${card.suit}-${card.rank}-${i}`"
        :card="card" :selected="isSelected(card)" :dimmed="!isMyTurn" @select="onSelectCard(card)"
      />
    </div>
    <div class="actions">
      <button class="btn-play" @click="onPlay" :disabled="!canPlay">出牌</button>
      <button class="btn-pass" @click="onPass" :disabled="!isMyTurn || mustPlay">过</button>
      <span v-if="invalidType" class="type-hint">牌型不当</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, nextTick } from 'vue'
import { useGameStore } from '@/stores/game'
import { identify } from '@79523/engine'
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'

const store = useGameStore()
const handArea = ref<HTMLElement | null>(null)
const props = defineProps<{ myHand: Card[]; isMyTurn: boolean; mustPlay: boolean }>()
const emit = defineEmits<{ play: [cards: Card[]]; pass: [] }>()

watch(() => store.trickVersion, () => {
  nextTick(() => {
    if (handArea.value) {
      handArea.value.scrollTo({ left: (handArea.value.scrollWidth - handArea.value.clientWidth) / 2, behavior: 'smooth' })
    }
  })
})

function isSelected(card: Card) { return store.selectedCards.includes(card) }
function onSelectCard(card: Card) { if (!props.isMyTurn) return; store.selectCard(card) }

const canPlay = computed(() => {
  if (!props.isMyTurn || store.selectedCards.length === 0) return false
  return identify(store.selectedCards) !== null
})

const invalidType = computed(() => {
  return props.isMyTurn && store.selectedCards.length > 0 && identify(store.selectedCards) === null
})

function onPlay() { if (!canPlay.value) return; emit('play', [...store.selectedCards]); store.clearSelection() }
function onPass() { if (props.mustPlay) return; emit('pass') }
</script>

<style scoped>
.player-hand { padding: 0.5rem; background: linear-gradient(to top, #0f172a, #1a2332); flex-shrink: 0; }
.hand-area { display: flex; justify-content: center; gap: 2px; overflow-x: auto; padding: 0.5rem 0; }
.actions { display: flex; gap: 0.75rem; justify-content: center; padding: 0.5rem 0; }
.btn-play, .btn-pass {
  padding: 0.55rem 2rem; font-size: 0.95rem; font-weight: 600;
  border-radius: 10px; border: none; cursor: pointer; transition: all 0.15s;
}
.btn-play { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; }
.btn-play:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(34,197,94,0.3); }
.btn-pass { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
.btn-pass:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239,68,68,0.3); }
.btn-play:disabled, .btn-pass:disabled { background: #334155; color: #64748b; cursor: not-allowed; transform: none; box-shadow: none; }
.type-hint {
  font-size: 0.75rem; color: #fbbf24; font-weight: 500;
  align-self: center; padding: 0.15rem 0.5rem;
  background: rgba(251,191,36,0.12); border-radius: 4px;
}
</style>
