<template>
  <div class="game-board">
    <div class="other-players">
      <PlayerSlot v-for="p in otherPlayers" :key="p.id" :name="p.name" :cardCount="p.cardCount" :score="p.score" :isActive="p.id === currentPlayerId" :isHighest="p.score === highestScore && p.score > 0" :color="playerColorMap[p.id]" :connected="p.connected !== false" :bubble="store.chatBubbles[p.id]" />
    </div>
    <div class="table-center">
      <DeckInfo :count="deckCount" />
      <TurnIndicator :isMyTurn="isMyTurn" :currentPlayer="currentPlayerName" :timeLeft="timeLeft" :currentPlayerOffline="currentPlayerOffline" />
      <TableCards :cards="tableCards" :plays="store.tablePlays" :colorMap="playerColorMap" />
    </div>
    <div class="self-score" v-if="store.myId && scores[store.myId] !== undefined">
      🏆 我的得分：<strong>{{ scores[store.myId] || 0 }}</strong> 分
    </div>
    <PlayerHand :myHand="myHand" :isMyTurn="isMyTurn" :mustPlay="mustPlay" @play="onPlay" @pass="onPass" />
    <div v-if="store.errorMessage" class="error-toast" @click="store.clearError">{{ store.errorMessage }}</div>
    <RoundBanner :playerNames="playerNames" :scores="scores" />
    <GameOverOverlay :playerNames="playerNames" />
    <BoxerOverlay :playerNames="playerNames" @boxer-move="onBoxerMove" />
    <ScorePopup :scores="scores" :playerNames="playerNames" :players="props.players" />
    <SurrenderOverlay :playerNames="playerNames" />
    <PlayBanner />
    <ChatPanel />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'
import PlayerHand from './PlayerHand.vue'
import TableCards from './TableCards.vue'
import TurnIndicator from './TurnIndicator.vue'
import DeckInfo from './DeckInfo.vue'
import PlayerSlot from './PlayerSlot.vue'
import { colorForIndex } from '@/playerColors'
import RoundBanner from './RoundBanner.vue'
import GameOverOverlay from './GameOverOverlay.vue'
import BoxerOverlay from './BoxerOverlay.vue'
import SurrenderOverlay from './SurrenderOverlay.vue'
import PlayBanner from './PlayBanner.vue'
import ScorePopup from './ScorePopup.vue'
import ChatPanel from './ChatPanel.vue'

const store = useGameStore()
const props = defineProps<{
  players: { id: string; name: string; cardCount: number; score: number; wins: number; boxerWins: number; connected?: boolean }[]
  currentPlayerId: string
  playerNames: Record<string, string>
}>()
const emit = defineEmits<{ play: [cards: Card[]]; pass: []; boxerMove: [move: string] }>()

const myHand = computed(() => store.myHand)
const tableCards = computed(() => store.tableCards)
const isMyTurn = computed(() => store.isMyTurn)
const timeLeft = computed(() => store.timeLeft)
const deckCount = computed(() => store.deckCount)
const scores = computed(() => store.scores)
const currentPlayerName = computed(() => props.playerNames[props.currentPlayerId] || '...')
const mustPlay = computed(() => store.isMyTurn && !store.tableCards.length)
const otherPlayers = computed(() => props.players.filter(p => p.id !== store.myId))
const playerColorMap = computed<Record<string, string>>(() =>
  Object.fromEntries(props.players.map((p, i) => [p.id, colorForIndex(i)]))
)
const highestScore = computed(() => Math.max(...props.players.map(p => p.score), 0))
// True while the player whose turn it is is offline (shows "waiting for reconnect").
const currentPlayerOffline = computed(() => {
  const p = props.players.find(x => x.id === props.currentPlayerId)
  return !!p && p.connected === false
})

function onPlay(cards: Card[]) { emit('play', cards) }
function onPass() { emit('pass') }
function onBoxerMove(move: string) { emit('boxerMove', move) }
</script>

<style scoped>
.game-board { display: flex; flex-direction: column; height: 100%; max-height: 100dvh; }
.other-players { display: flex; justify-content: center; gap: 0.75rem; padding: 0.5rem; flex-wrap: wrap; flex-shrink: 0; }
.table-center { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 0.4rem; padding: 0.25rem 0.5rem; overflow-y: auto; }
.self-score { text-align: center; padding: 0.25rem; font-size: 0.85rem; color: #94a3b8; }
.self-score strong { color: #fbbf24; }
.error-toast {
  position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
  background: rgba(251,191,36,0.9); color: #1a1a2e; padding: 0.35rem 0.9rem;
  border-radius: 6px; font-size: 0.8rem; font-weight: 500; z-index: 100;
  cursor: pointer; box-shadow: 0 2px 8px rgba(251,191,36,0.25);
  animation: fadeIn 0.15s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } }
</style>
