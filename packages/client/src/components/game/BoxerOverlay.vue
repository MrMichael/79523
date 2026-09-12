<template>
  <div v-if="store.boxerPhase !== 'idle' && store.boxerPhase !== 'done'" class="boxer-overlay">
    <div class="boxer-card">
      <!-- Score card display -->
      <div class="score-card-area">
        <p class="boxer-title">{{ store.boxerScoreCard ? '拳王争霸' : '决胜局' }}</p>
        <div v-if="store.boxerScoreCard" class="score-card-badge">
          <span class="card-symbol">{{ cardLabel(store.boxerScoreCard) }}</span>
          <span class="card-points">+{{ cardPoints(store.boxerScoreCard) }}分</span>
        </div>
        <div v-else class="tiebreak-badge">排位决胜</div>
        <!-- Player scores summary -->
        <div class="boxer-scores">
          <div v-for="(name, id) in playerNames" :key="id" class="boxer-score-row">
            <span class="bs-name">{{ name }}</span>
            <span class="bs-score">{{ store.boxerGameScores[id] || 0 }}分</span>
            <span class="bs-wins" v-if="(store.boxerWinCounts[id] || 0) > 0">🥊×{{ store.boxerWinCounts[id] }}</span>
          </div>
        </div>
      </div>

      <!-- Spectating -->
      <div v-if="isSpectating" class="spectating-area">
        <p class="spectating-msg">观摩排位决胜中...</p>
      </div>

      <!-- Awaiting moves -->
      <div v-if="store.boxerPhase === 'awaiting' && !isSpectating" class="move-selection">
        <p class="prompt">选择你的出拳</p>
        <div class="countdown" :class="{ urgent: countdown <= 1 }">{{ countdown > 0 ? countdown : '⚡' }}</div>
        <div class="move-buttons">
          <button class="move-btn rock" @click="submitMove('rock')" :disabled="moveSubmitted">
            <span class="btn-emoji">✊</span><span class="btn-label">石头</span>
          </button>
          <button class="move-btn scissors" @click="submitMove('scissors')" :disabled="moveSubmitted">
            <span class="btn-emoji">✌️</span><span class="btn-label">剪刀</span>
          </button>
          <button class="move-btn paper" @click="submitMove('paper')" :disabled="moveSubmitted">
            <span class="btn-emoji">✋</span><span class="btn-label">布</span>
          </button>
        </div>
        <p v-if="moveSubmitted" class="submitted-hint">已出拳，等待其他玩家...</p>
      </div>

      <!-- Reveal -->
      <div v-if="store.boxerPhase === 'reveal'" class="reveal-area">
        <p class="prompt">揭晓！</p>
        <div class="moves-grid">
          <div v-for="id in store.boxerParticipants" :key="id"
            class="move-reveal"
            :class="{
              eliminated: !store.boxerSurvivors.includes(id),
              'reveal-anim': revealPhase === 'revealing',
              'reveal-done': revealPhase === 'shown',
            }">
            <span class="player-label">{{ playerNames[id] || id.slice(0,4) }}</span>
            <span class="move-emoji" :class="{ 'emoji-pop': revealPhase === 'shown' }">{{ moveEmoji(store.boxerMoves[id]) }}</span>
            <span v-if="!store.boxerSurvivors.includes(id)" class="elim-tag">淘汰</span>
          </div>
        </div>
      </div>

      <!-- Eliminated -->
      <div v-if="store.boxerPhase === 'eliminated'" class="eliminated-area">
        <p class="eliminated-msg">你已被淘汰</p>
        <p class="eliminated-sub">等待拳王决出...</p>
      </div>

      <!-- Winner announcement -->
      <div v-if="store.boxerWinnerId && store.boxerScoreCard" class="winner-area">
        <p class="winner-msg">
          🏆 {{ store.boxerWinnerId === store.myId ? '你' : (playerNames[store.boxerWinnerId] || '玩家') }}
          赢得 {{ cardLabel(store.boxerScoreCard) }}
          <span class="win-points">+{{ store.boxerWinPoints || cardPoints(store.boxerScoreCard) }}分</span>！
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { watch } from 'vue'
import type { Card, Rank, Suit } from '@79523/engine'

const store = useGameStore()
const isSpectating = computed(() =>
  store.boxerParticipants.length > 0 && !store.boxerParticipants.includes(store.myId)
)
const localSubmitted = ref(false)
// Reflects both the optimistic local click and the server's "already submitted" flag
// (the latter matters after a reconnect during a boxer round).
const moveSubmitted = computed(() => localSubmitted.value || store.boxerSubmitted)
const countdown = ref(3)
const revealPhase = ref<'hidden' | 'revealing' | 'shown'>('hidden')
let countdownTimer: ReturnType<typeof setInterval> | null = null
let winnerTimer: ReturnType<typeof setTimeout> | null = null

// Auto-hide winner announcement after 2s
watch(() => store.boxerWinnerId, (id) => {
  if (id) {
    if (winnerTimer) clearTimeout(winnerTimer)
    winnerTimer = setTimeout(() => { store.boxerWinnerId = '' }, 2000)
  }
})

const props = defineProps<{ playerNames: Record<string, string> }>()
const emit = defineEmits<{ boxerMove: [move: string] }>()

const RANK_LABELS: Record<number, string> = {
  0: '4', 1: '6', 2: '8', 3: '10', 4: 'J', 5: 'Q', 6: 'K',
  7: 'A', 8: '3', 9: '2', 10: '5', 11: '9', 12: '7',
}
const SUIT_SYMBOLS: Record<number, string> = { 0: '♠', 1: '♥', 2: '♣', 3: '♦' }

function cardLabel(card: Card | null): string {
  if (!card) return '?'
  return `${SUIT_SYMBOLS[card.suit] || ''}${RANK_LABELS[card.rank] || '?'}`
}

function cardPoints(card: Card | null): number {
  if (!card) return 0
  const r = card.rank
  if (r === 10) return 5   // 5
  if (r === 3 || r === 6) return 10  // 10, K
  return 0
}

function moveEmoji(move: string): string {
  if (move === 'rock') return '✊'
  if (move === 'scissors') return '✌️'
  if (move === 'paper') return '✋'
  return '❓'
}

function submitMove(move: string) {
  localSubmitted.value = true
  emit('boxerMove', move)
}

// Reset when new boxer round starts
function startCountdown() {
  countdown.value = 3
  revealPhase.value = 'hidden'
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

watch(() => store.boxerPhase, (phase) => {
  if (phase === 'awaiting') {
    localSubmitted.value = false
    if (!store.boxerSubmitted) startCountdown()
  }
  if (phase === 'reveal') {
    revealPhase.value = 'revealing'
    setTimeout(() => { revealPhase.value = 'shown' }, 800)
  }
  if (phase === 'idle' || phase === 'done') {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
    revealPhase.value = 'hidden'
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.boxer-overlay {
  position: fixed; inset: 0; z-index: 250;
  background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.boxer-card {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid #e2b04a; border-radius: 1rem; padding: 1.5rem;
  max-width: 360px; width: 90%; text-align: center; color: #eee;
}
.boxer-title { font-size: 1.5rem; font-weight: 700; color: #e2b04a; margin-bottom: 0.75rem; }
.score-card-area { margin-bottom: 1rem; }
.score-card-badge, .tiebreak-badge {
  display: inline-flex; align-items: center; gap: 0.5rem;
  background: #2a2a4a; border: 1px solid #e2b04a; border-radius: 0.5rem;
  padding: 0.5rem 1rem; font-size: 1.2rem;
}
.tiebreak-badge { border-color: #ff6b6b; color: #ff6b6b; }
.card-symbol { font-size: 1.5rem; }
.card-points { color: #4fc3f7; font-weight: 700; }

.boxer-scores { margin-top: 0.5rem; font-size: 0.75rem; color: #94a3b8; }
.boxer-score-row { display: flex; justify-content: space-between; padding: 0.15rem 0; }
.bs-name { flex: 1; text-align: left; }
.bs-score { color: #fbbf24; font-weight: 600; min-width: 3rem; text-align: right; }
.bs-wins { color: #e2b04a; margin-left: 0.5rem; }

.prompt { font-size: 1rem; color: #ccc; margin-bottom: 0.75rem; }
.countdown { font-size: 2.5rem; font-weight: 700; color: #e2b04a; margin-bottom: 0.5rem; }

.move-buttons { display: flex; gap: 0.75rem; justify-content: center; }
.move-btn {
  width: 90px; height: 90px; border-radius: 0.75rem; border: 2px solid #555;
  background: #1e1e3a; color: #eee; font-size: 0.9rem; cursor: pointer;
  transition: all 0.15s;
}
.move-btn:not(:disabled):hover { border-color: #e2b04a; transform: scale(1.05); }
.move-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.submitted-hint { margin-top: 0.75rem; color: #888; font-size: 0.85rem; }

.reveal-area { margin: 0.5rem 0; }
.moves-grid { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
.move-reveal {
  background: #2a2a4a; border-radius: 0.5rem; padding: 0.5rem 0.75rem;
  text-align: center; min-width: 70px; transition: all 0.3s;
}
.move-reveal.eliminated { background: #3a1a1a; opacity: 0.6; }
.player-label { font-size: 0.75rem; color: #aaa; display: block; }
.move-emoji { font-size: 1.6rem; display: block; margin: 0.25rem 0; }
.elim-tag { font-size: 0.7rem; color: #f44336; }

/* ── Animations ── */
.countdown.urgent { color: #f44336; animation: pulse 0.5s ease-in-out infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }

.move-reveal.reveal-anim { animation: flipIn 0.4s ease-out; }
@keyframes flipIn {
  0% { transform: rotateY(90deg) scale(0.5); opacity: 0; }
  100% { transform: rotateY(0) scale(1); opacity: 1; }
}
.move-emoji.emoji-pop { animation: popIn 0.3s ease-out 0.4s both; }
@keyframes popIn {
  0% { transform: scale(0); }
  80% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

.move-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.btn-emoji { font-size: 1.5rem; }
.btn-label { font-size: 0.7rem; }

.eliminated-area { margin: 1rem 0; }
.eliminated-msg { font-size: 1.2rem; color: #f44336; font-weight: 700; }
.eliminated-sub { font-size: 0.85rem; color: #888; }

.winner-area {
  margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #444;
  animation: winPop 0.3s ease-out;
}
@keyframes winPop { from { transform: scale(0.8); opacity: 0; } }
.winner-msg { font-size: 1.1rem; color: #ffd740; font-weight: 700; }
.win-points { color: #22c55e; font-size: 1.3rem; font-weight: 800; }
</style>
