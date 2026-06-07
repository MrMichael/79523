<template>
  <div v-if="active" class="surrender-overlay">
    <div class="surrender-card">
      <h2 class="title">⚔️ 交粮环节</h2>
      <p class="phase-info">{{ info }}</p>

      <!-- Loser: select largest card to give up -->
      <div v-if="phase === 'losers_give'" class="phase-content">
        <p v-if="myRole === 'loser'" class="prompt">选择你手中最大的牌上缴：</p>
        <p v-else class="prompt waiting">{{ info }}</p>

        <div v-if="myRole === 'loser'" class="card-grid">
          <CardSprite v-for="(c, i) in myHand" :key="i" :card="c"
            :selected="isSelected(c)"
            :dimmed="!isLargestCard(c)"
            @select="isLargestCard(c) && toggleCard(c)" />
        </div>
        <p v-if="myRole === 'loser'" class="hint-text">只能选择最大的单张牌（已高亮）</p>
        <button v-if="myRole === 'loser'" class="action-btn" :disabled="selectedCards.length !== 1"
          @click="submitGive">上缴</button>
      </div>

      <!-- Winner: pick from surrendered cards -->
      <div v-else-if="phase === 'winners_pick'" class="phase-content">
        <p v-if="myRole === 'winner'" class="prompt">选择对手上缴的牌：</p>
        <p v-else class="prompt waiting">{{ info }}</p>

        <div v-if="myRole === 'winner' && surrenderedCardsForPick.length" class="card-grid">
          <CardSprite v-for="(sc, i) in surrenderedCardsForPick" :key="i" :card="sc.card"
            :selected="isSelected(sc.card)" @select="toggleCard(sc.card)" />
        </div>
        <button v-if="myRole === 'winner'" class="action-btn" :disabled="selectedCards.length !== 1"
          @click="submitPick">挑选</button>
      </div>

      <!-- Winner: return a card -->
      <div v-else-if="phase === 'winners_return'" class="phase-content">
        <p v-if="myRole === 'winner'" class="prompt">选择一张牌还给对手：</p>
        <p v-else class="prompt waiting">{{ info }}</p>

        <div v-if="myRole === 'winner'" class="card-grid">
          <CardSprite v-for="(c, i) in myHand" :key="i" :card="c"
            :selected="isSelected(c)" @select="toggleCard(c)" />
        </div>
        <button v-if="myRole === 'winner'" class="action-btn" :disabled="selectedCards.length !== 1"
          @click="submitReturn">返还</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSocket } from '@/composables/useSocket'
import type { Card } from '@79523/engine'
import CardSprite from '@/components/common/CardSprite.vue'

const { socket } = useSocket()

const active = ref(false)
const phase = ref<'losers_give' | 'winners_pick' | 'winners_return' | ''>('')
const myRole = ref<'loser' | 'winner' | 'spectator'>('spectator')
const myHand = ref<Card[]>([])
const info = ref('')
const surrenderedCardsForPick = ref<{ playerId: string; playerName: string; card: Card }[]>([])
const selectedCards = ref<Card[]>([])

const largestCard = computed(() => {
  if (!myHand.value.length) return null
  return myHand.value.reduce((a, b) => a.rank > b.rank ? a : b)
})

function isLargestCard(card: Card): boolean {
  if (!largestCard.value) return false
  return card.suit === largestCard.value.suit && card.rank === largestCard.value.rank
}

function isSelected(card: Card): boolean {
  return selectedCards.value.some(c => c.suit === card.suit && c.rank === card.rank)
}

function toggleCard(card: Card) {
  if (myRole.value === 'spectator') return
  const idx = selectedCards.value.findIndex(c => c.suit === card.suit && c.rank === card.rank)
  if (idx >= 0) selectedCards.value.splice(idx, 1)
  else selectedCards.value = [card] // Only allow one selection
}

function submitGive() {
  if (selectedCards.value.length !== 1) return
  socket.value?.emit('surrender_give', { card: selectedCards.value[0] })
  selectedCards.value = []
}

function submitPick() {
  if (selectedCards.value.length !== 1) return
  socket.value?.emit('surrender_pick', { card: selectedCards.value[0] })
  selectedCards.value = []
}

function submitReturn() {
  if (selectedCards.value.length !== 1) return
  socket.value?.emit('surrender_return', { card: selectedCards.value[0] })
  selectedCards.value = []
}

onMounted(() => {
  socket.value?.on('surrender_start', (data: any) => {
    active.value = true
    phase.value = data.phase
    myRole.value = data.yourRole
    myHand.value = data.hand || []
    info.value = data.info || ''

    if (data.surrenderedCards) {
      surrenderedCardsForPick.value = data.surrenderedCards
    }
  })

  socket.value?.on('surrender_update', (data: any) => {
    info.value = data.info || info.value
    if (data.surrenderedCards !== undefined) {
      surrenderedCardsForPick.value = data.surrenderedCards
    }
  })

  socket.value?.on('next_game_lead', () => {
    // Clean up when surrender flow completes
    active.value = false
    phase.value = ''
    myRole.value = 'spectator'
    myHand.value = []
    surrenderedCardsForPick.value = []
    selectedCards.value = []
  })
})
</script>

<style scoped>
.surrender-overlay {
  position: fixed; inset: 0; z-index: 250;
  background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.surrender-card {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid #22c55e; border-radius: 1rem; padding: 1.5rem;
  max-width: 400px; width: 92%; text-align: center; color: #eee;
  max-height: 90vh; overflow-y: auto;
}
.title { font-size: 1.4rem; font-weight: 700; color: #22c55e; margin-bottom: 0.5rem; }
.phase-info { font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.75rem; }
.phase-content { margin: 0.5rem 0; }
.prompt { font-size: 0.95rem; color: #e2e8f0; margin-bottom: 0.75rem; }
.waiting { color: #64748b; font-style: italic; }
.card-grid { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; padding: 0.5rem 0; }
.action-btn {
  margin-top: 1rem; padding: 0.75rem 2.5rem; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #22c55e, #16a34a); color: white;
  transition: all 0.15s;
}
.action-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(34,197,94,0.3); }
.action-btn:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
.hint-text { font-size: 0.75rem; color: #e2b04a; margin-top: 0.25rem; }
</style>
