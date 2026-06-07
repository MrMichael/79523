<template>
  <Transition name="banner">
    <div v-if="visible" class="play-banner" :class="typeClass">
      <span class="banner-player">{{ player }}</span>
      <span v-if="currentType === 'root'" class="banner-icon-root">👑</span>
      <span class="banner-label">{{ typeLabel }}</span>
      <div class="banner-cards">
        <span v-for="(c, i) in cards" :key="i" class="banner-card" :class="{ red: c.suit === 1 || c.suit === 3 }">{{ cardStr(c) }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'

const store = useGameStore()
const visible = ref(false)
const currentType = ref('')
const cards = ref<Card[]>([])
const player = ref('')
const timer = ref<ReturnType<typeof setTimeout> | null>(null)

const RL: Record<number, string> = { 0:'4',1:'6',2:'8',3:'10',4:'J',5:'Q',6:'K',7:'A',8:'3',9:'2',10:'5',11:'9',12:'7' }
const SL: Record<number, string> = { 0:'♠',1:'♥',2:'♣',3:'♦' }
function cardStr(c: Card) { return `${RL[c.rank]||'?'}${SL[c.suit]||'?'}` }

const typeLabel = computed(() => {
  const m: Record<string, string> = { single: '单张', pair: '对子', bike: '单车', triple: '三条', root: '根号！' }
  return m[currentType.value] || ''
})
const typeClass = computed(() => {
  const m: Record<string, string> = { single: 'type-single', pair: 'type-pair', bike: 'type-bike', triple: 'type-triple', root: 'type-root' }
  return m[currentType.value] || 'type-single'
})

watch(() => store.tableCards, (newVal, oldVal) => {
  if (newVal.length > 0 && newVal !== oldVal) showBanner()
})

function showBanner() {
  currentType.value = store.lastPlayType || 'single'
  cards.value = [...store.lastPlayedCards]
  player.value = store.lastPlayPlayer
  visible.value = true
  if (timer.value) clearTimeout(timer.value)
  timer.value = setTimeout(() => { visible.value = false }, currentType.value === 'root' ? 2000 : 1000)
}
</script>

<style scoped>
.play-banner {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 150; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
  padding: 0.75rem 1.5rem; border-radius: 1rem;
  backdrop-filter: blur(8px);
}
.banner-player { font-size: 0.8rem; font-weight: 600; opacity: 0.85; }
.banner-icon-root { font-size: 2.5rem; }
.banner-label { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.08em; }
.banner-cards { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; margin-top: 0.15rem; }
.banner-card {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 54px; border-radius: 4px;
  font-size: 0.9rem; font-weight: 700;
  background: linear-gradient(135deg, #f8fafc, #e2e8f0); color: #1e293b;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.banner-card.red { color: #dc2626; }

/* Per-type colored backgrounds */
.type-single {
  background: linear-gradient(135deg, rgba(148,163,184,0.25), rgba(100,116,139,0.2));
  border: 2px solid rgba(148,163,184,0.35);
}
.type-single .banner-player { color: #94a3b8; }
.type-single .banner-label { color: #cbd5e1; }

.type-pair {
  background: linear-gradient(135deg, rgba(59,130,246,0.3), rgba(37,99,235,0.2));
  border: 2px solid rgba(96,165,250,0.5);
}
.type-pair .banner-player { color: #93c5fd; }
.type-pair .banner-label { color: #60a5fa; }

.type-bike {
  background: linear-gradient(135deg, rgba(168,85,247,0.3), rgba(147,51,234,0.2));
  border: 2px solid rgba(192,132,252,0.5);
}
.type-bike .banner-player { color: #c4b5fd; }
.type-bike .banner-label { color: #c084fc; }

.type-triple {
  background: linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.2));
  border: 2px solid rgba(248,113,113,0.5);
}
.type-triple .banner-player { color: #fca5a5; }
.type-triple .banner-label { color: #f87171; }

.type-root {
  background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.15));
  border: 2px solid rgba(251,191,36,0.7);
  animation: rootPulse 0.6s ease-in-out infinite alternate;
}
.type-root .banner-player { color: #fcd34d; }
.type-root .banner-label { color: #fbbf24; text-shadow: 0 0 12px rgba(251,191,36,0.5); }

@keyframes rootPulse {
  0% { transform: translate(-50%, -50%) scale(1); box-shadow: 0 0 20px rgba(251,191,36,0.2); }
  100% { transform: translate(-50%, -50%) scale(1.08); box-shadow: 0 0 40px rgba(251,191,36,0.4); }
}

.banner-enter-active { transition: all 0.25s ease-out; }
.banner-leave-active { transition: all 0.2s ease-in; }
.banner-enter-from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
.banner-leave-to { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
</style>
