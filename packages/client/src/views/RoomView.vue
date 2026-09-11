<template>
  <div class="room">
    <div class="room-header">
      <div class="code-display">
        <span class="code-text">{{ roomCode }}</span>
        <button class="copy-btn" @click="copyCode">{{ copied ? '已复制' : '复制' }}</button>
      </div>
      <p class="share-hint">把房间码发给好友，他们在首页输入即可加入</p>
    </div>

    <div class="player-section">
      <div class="player-item" v-for="p in players" :key="p.id">
        <span class="status-dot" :class="{ ready: p.ready }"></span>
        <span class="player-name">{{ p.name }}{{ p.isHost ? ' 👑' : '' }}</span>
        <span class="player-stats">
          <span v-if="(p.wins ?? 0) > 0 || (p.boxerWins ?? 0) > 0" class="stat-badge">
            🏆{{ p.wins ?? 0 }} 🥊{{ p.boxerWins ?? 0 }}
          </span>
        </span>
        <span class="player-state">{{ p.ready ? '已准备' : '等待中' }}</span>
      </div>
      <div v-if="players.length === 0" class="empty-hint">等待其他玩家加入...</div>
    </div>

    <!-- Leaderboard -->
    <div v-if="hasStats || lastGameScores.length" class="leaderboard">
      <h3 class="lb-title">📊 积分榜</h3>
      <div v-for="(p, i) in sortedPlayers" :key="p.id" class="lb-item">
        <span class="lb-rank">{{ rankLabel(i) }}</span>
        <span class="lb-name">{{ p.name }}</span>
        <span class="lb-stats">
          <span v-if="lastGameScores[p.id] !== undefined" class="lb-score">{{ lastGameScores[p.id] }}分</span>
          🏆 {{ p.wins ?? 0 }} 胜 &nbsp; 🥊 {{ p.boxerWins ?? 0 }} 拳王
        </span>
      </div>
    </div>

    <div class="room-footer">
      <p v-if="!amReady" class="hint">所有人准备后自动开始</p>
      <p v-else class="hint ready-text">已准备，等待其他玩家...</p>
      <div class="footer-btns">
        <button @click="handleReady" :disabled="amReady" class="ready-btn full-width">
          {{ amReady ? '已准备' : '准备' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSocket } from '@/composables/useSocket'
import { useRoom } from '@/composables/useRoom'
import { useGameStore } from '@/stores/game'

const { connect } = useSocket()
const { roomCode, players, amReady, myId, ready, startNewGame, setupListeners } = useRoom()
const gameStore = useGameStore()
const copied = ref(false)

onMounted(() => {
  connect()
  setupListeners()
})

const isHost = computed(() => players.value.some(p => p.id === myId.value && p.isHost))
const hasStats = computed(() =>
  players.value.some(p => (p.wins ?? 0) > 0 || (p.boxerWins ?? 0) > 0) ||
  gameStore.finalRankings.length > 0
)
const sortedPlayers = computed(() => {
  // Use server's authoritative ranking from last game scores_updated event
  const rankings = gameStore.finalRankings
  if (rankings.length) {
    return rankings.map(r => players.value.find(p => p.id === r.id)).filter(Boolean) as typeof players.value
  }
  // Fallback for fresh room with no game history
  return [...players.value].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.boxerWins ?? 0) - (a.boxerWins ?? 0))
})
function rankLabel(i: number) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}` }
const lastGameScores = computed(() => {
  const scores: Record<string, number> = {}
  for (const r of gameStore.finalRankings) {
    scores[r.id] = r.totalScore
  }
  return scores
})

function handleReady() { ready() }
function handleNewGame() { startNewGame() }
function copyCode() {
  navigator.clipboard.writeText(roomCode.value)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}
</script>

<style scoped>
.room {
  display: flex; flex-direction: column; height: 100%; padding: 1.5rem;
}
.room-header {
  text-align: center; margin-bottom: 1.5rem;
}
.code-display {
  display: flex; align-items: center; justify-content: center; gap: 0.75rem;
}
.code-text {
  font-size: 2.2rem; font-weight: 800; letter-spacing: 0.25em;
  color: #fbbf24;
}
.copy-btn {
  padding: 0.4rem 0.9rem; font-size: 0.8rem; border: 1px solid rgba(251,191,36,0.3);
  border-radius: 8px; background: rgba(251,191,36,0.1); color: #fbbf24;
  cursor: pointer; font-weight: 600; transition: all 0.15s;
}
.copy-btn:hover { background: rgba(251,191,36,0.2); }
.share-hint { font-size: 0.8rem; color: #64748b; margin-top: 0.75rem; }
.player-section {
  flex: 1; display: flex; flex-direction: column; gap: 0.5rem;
}
.player-item {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
}
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: #475569; flex-shrink: 0; }
.status-dot.ready { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.4); }
.player-name { font-weight: 600; flex: 1; color: #e2e8f0; }
.player-state { font-size: 0.8rem; color: #64748b; }
.empty-hint { text-align: center; color: #475569; padding: 2rem; }
.room-footer { text-align: center; padding-top: 1rem; }
.footer-btns { display: flex; gap: 0.75rem; }
.hint { font-size: 0.85rem; color: #64748b; margin-bottom: 0.75rem; }
.ready-text { color: #22c55e; }
.ready-btn {
  flex: 1; padding: 0.9rem; font-size: 0.95rem; font-weight: 600;
  border: none; border-radius: 12px; cursor: pointer; transition: all 0.15s;
  background: linear-gradient(135deg, #22c55e, #16a34a); color: white;
}
.ready-btn.full-width { flex: 1; }
.ready-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(34,197,94,0.3); }
.ready-btn:disabled { background: rgba(255,255,255,0.06); color: #475569; cursor: not-allowed; transform: none; box-shadow: none; }
.player-stats { font-size: 0.75rem; color: #94a3b8; margin-left: auto; margin-right: 0.5rem; }
.stat-badge { font-size: 0.7rem; }
.leaderboard {
  margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
}
.lb-title { font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.5rem; }
.lb-item { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0; font-size: 0.8rem; color: #cbd5e1; }
.lb-rank { width: 20px; font-size: 0.85rem; flex-shrink: 0; }
.lb-stats { color: #94a3b8; }
.lb-score { color: #fbbf24; font-weight: 600; margin-right: 0.5rem; }
</style>
