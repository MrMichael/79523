<template>
  <Transition name="banner">
    <div v-if="visible" class="round-banner" @click="dismiss">
      <div class="banner-title">🏆 {{ winnerName }} 赢得此墩</div>
      <div v-if="scoreCards.length" class="banner-cards">
        <span class="banner-label">得分牌:</span>
        <CardSprite v-for="(c, i) in scoreCards" :key="i" :card="c" />
      </div>
      <div class="banner-scores">
        <span v-for="(score, id) in scores" :key="id" class="banner-score-item">
          {{ playerNames[id] || id }}: {{ score }}
        </span>
      </div>
      <div class="banner-hint">点击继续</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import CardSprite from '@/components/common/CardSprite.vue'
import type { Card } from '@79523/engine'

const store = useGameStore()
const props = defineProps<{
  playerNames: Record<string, string>
  scores: Record<string, number>
}>()

const visible = ref(false)
let dismissTimer: ReturnType<typeof setTimeout> | null = null

const winnerName = computed(() => props.playerNames[store.roundWinnerId] || store.roundWinnerId)
const scoreCards = computed(() => store.roundScoreCards as Card[])

watch(() => store.roundWinnerId, (newVal) => {
  if (newVal) {
    visible.value = true
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(() => dismiss(), 2000)
  }
})

function dismiss() {
  visible.value = false
  store.clearRoundBanner()
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
}
</script>

<style scoped>
.round-banner {
  position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #ffd54f, #ffb300);
  border-radius: 16px; padding: 1.5rem 2rem; z-index: 100;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3); cursor: pointer;
  text-align: center; min-width: 240px;
}
.banner-title { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.5rem; color: #333; }
.banner-cards { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 0.5rem 0; flex-wrap: wrap; }
.banner-label { font-size: 0.85rem; color: #555; }
.banner-scores { display: flex; gap: 1rem; justify-content: center; margin-top: 0.5rem; }
.banner-score-item { font-weight: 600; font-size: 0.9rem; color: #333; }
.banner-hint { font-size: 0.7rem; color: #666; margin-top: 0.5rem; }

.banner-enter-active { transition: all 0.3s ease-out; }
.banner-leave-active { transition: all 0.2s ease-in; }
.banner-enter-from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
.banner-leave-to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
</style>
