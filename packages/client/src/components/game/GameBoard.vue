<template>
  <div class="game-board">
    <div class="other-players">
      <PlayerSlot v-for="p in otherPlayers" :key="p.id" :name="p.name" :cardCount="p.cardCount" :score="p.score" :isActive="p.id === currentPlayerId" />
    </div>
    <div class="table-center">
      <DeckInfo :count="deckCount" />
      <TurnIndicator :isMyTurn="isMyTurn" :currentPlayer="currentPlayerName" :timeLeft="timeLeft" />
      <TableCards :cards="tableCards" />
      <ScoreDisplay :scores="scores" :playerNames="playerNames" />
    </div>
    <PlayerHand :myHand="myHand" :isMyTurn="isMyTurn" :mustPlay="mustPlay" @play="onPlay" @pass="onPass" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'
import PlayerHand from './PlayerHand.vue'
import TableCards from './TableCards.vue'
import ScoreDisplay from './ScoreDisplay.vue'
import TurnIndicator from './TurnIndicator.vue'
import DeckInfo from './DeckInfo.vue'
import PlayerSlot from './PlayerSlot.vue'

const store = useGameStore()
const props = defineProps<{
  players: { id: string; name: string; cardCount: number; score: number }[]
  currentPlayerId: string
  playerNames: Record<string, string>
}>()
const emit = defineEmits<{ play: [cards: Card[]]; pass: [] }>()

const myHand = computed(() => store.myHand)
const tableCards = computed(() => store.tableCards)
const isMyTurn = computed(() => store.isMyTurn)
const timeLeft = computed(() => store.timeLeft)
const deckCount = computed(() => store.deckCount)
const scores = computed(() => store.scores)
const currentPlayerName = computed(() => props.playerNames[props.currentPlayerId] || '...')
const mustPlay = computed(() => store.isMyTurn && !store.tableCards.length)
const otherPlayers = computed(() => props.players.filter(p => p.id !== store.myId))

function onPlay(cards: Card[]) { emit('play', cards) }
function onPass() { emit('pass') }
</script>

<style scoped>
.game-board { display: flex; flex-direction: column; height: 100%; max-height: 100svh; }
.other-players { display: flex; justify-content: center; gap: 1rem; padding: 0.5rem; flex-wrap: wrap; }
.table-center { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 0.5rem; padding: 0.5rem; overflow-y: auto; }
</style>
