<template>
  <div class="score-popup">
    <button class="toggle-btn" @click="show = !show" :title="show ? '收起排名榜' : '查看排名榜'">
      📊{{ show ? '收起' : '排名榜' }}
    </button>
    <Transition name="slide">
      <div v-if="show" class="popup-panel">
        <h4>{{ playerNames[store.myId] || '我' }} · 本局 {{ myScore }}分 · 手牌 {{ myCards }}张</h4>
        <div class="popup-list">
          <div v-for="(p, i) in rankedPlayers" :key="p.id" class="popup-row">
            <span class="popup-rank">{{ rankChar(i) }}</span>
            <span class="popup-name">{{ playerNames[p.id] || p.id.slice(0,4) }}</span>
            <span class="popup-cards">{{ p.cardCount }}张</span>
            <span class="popup-score">{{ p.score }}分</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const show = ref(false)

const props = defineProps<{ scores: Record<string, number>; playerNames: Record<string, string>; players: { id: string; name: string; cardCount: number; score: number }[] }>()

const rankedPlayers = computed(() =>
  [...props.players].sort((a, b) => b.score - a.score)
)

const myScore = computed(() => props.scores[store.myId] || 0)
const myCards = computed(() => store.myHand.length)

function rankChar(i: number) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}` }
</script>

<style scoped>
.score-popup {
  position: fixed; top: 50px; right: 8px; z-index: 300;
  display: flex; flex-direction: column; align-items: flex-end;
}
.toggle-btn {
  background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.3);
  color: #fbbf24; padding: 0.3rem 0.7rem; border-radius: 8px;
  font-size: 0.8rem; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
}
.toggle-btn:hover { background: rgba(251,191,36,0.25); }
.popup-panel {
  margin-top: 0.4rem; background: rgba(15,23,42,0.95);
  border: 1px solid rgba(251,191,36,0.2); border-radius: 10px;
  padding: 0.75rem 1rem; min-width: 180px;
  backdrop-filter: blur(8px);
}
.popup-panel h4 { font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.5rem; text-align: center; }
.popup-list { display: flex; flex-direction: column; gap: 0.25rem; }
.popup-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
.popup-rank { width: 20px; font-size: 0.85rem; }
.popup-name { flex: 1; color: #e2e8f0; font-weight: 500; }
.popup-cards { color: #64748b; font-size: 0.75rem; width: 30px; text-align: right; }
.popup-score { color: #fbbf24; font-weight: 600; width: 38px; text-align: right; }

.slide-enter-active { transition: all 0.2s ease-out; }
.slide-leave-active { transition: all 0.15s ease-in; }
.slide-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
