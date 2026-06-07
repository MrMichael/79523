<template>
  <Transition name="overlay">
    <div v-if="store.gameOver" class="game-over-overlay">
      <div class="game-over-card">
        <h2 class="overlay-title">🎉 游戏结束</h2>
        <div class="rankings">
          <div v-for="(rank, i) in rankings" :key="rank.id" class="rank-item" :class="rankClass(i)">
            <span class="rank-pos">{{ rankLabel(i) }}</span>
            <span class="rank-name">{{ playerNames[rank.id] || rank.id }}</span>
            <span class="rank-score">{{ rank.totalScore }} 分</span>
          </div>
        </div>
        <button class="restart-btn" @click="goRoom">返回房间</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/game'
import { useRoom } from '@/composables/useRoom'
import { useSocket } from '@/composables/useSocket'

const store = useGameStore()
const router = useRouter()
const { players, myId } = useRoom()
const { socket } = useSocket()

const props = defineProps<{ playerNames: Record<string, string> }>()

const rankings = computed(() => store.finalRankings)

function rankLabel(i: number): string {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `#${i + 1}`
}

function rankClass(i: number): string {
  if (i === 0) return 'gold'
  if (i === 1) return 'silver'
  return ''
}

function goRoom() {
  const code = (router.currentRoute.value.params.code as string) || ''
  router.push(`/room/${code}`)
  setTimeout(() => {
    if (players.value.some(p => p.id === myId.value && p.isHost)) {
      socket.value?.emit('start_new_game')
    }
  }, 500)
}
</script>

<style scoped>
.game-over-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.game-over-card {
  background: white; border-radius: 20px; padding: 2rem 2.5rem;
  text-align: center; max-width: 360px; width: 90%;
  box-shadow: 0 12px 48px rgba(0,0,0,0.3);
}
.overlay-title { font-size: 1.5rem; margin-bottom: 1.25rem; }
.rankings { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
.rank-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem;
  border-radius: 10px; background: #f5f5f5;
}
.rank-item.gold { background: #fff8e1; }
.rank-item.silver { background: #f5f5f5; }
.rank-pos { font-size: 1.2rem; }
.rank-name { flex: 1; font-weight: 600; text-align: left; }
.rank-score { font-weight: 700; color: #ff6f00; }
.restart-btn {
  padding: 0.75rem 2rem; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 10px; background: #2196f3; color: white; cursor: pointer;
}

.overlay-enter-active { transition: all 0.4s ease-out; }
.overlay-leave-active { transition: all 0.3s ease-in; }
.overlay-enter-from { opacity: 0; }
.overlay-enter-from .game-over-card { transform: scale(0.8); }
</style>
