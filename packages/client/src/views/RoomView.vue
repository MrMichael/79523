<template>
  <div class="room">
    <div class="room-topbar">
      <button class="leave-btn" @click="leaveRoom">← 退出房间</button>
    </div>
    <div class="room-header">
      <div class="code-display">
        <span class="code-text">{{ roomCode }}</span>
        <button class="copy-btn" @click="copyCode">{{ copied ? '已复制' : '复制' }}</button>
      </div>
      <p class="share-hint">把房间码发给好友，他们在首页输入即可加入</p>
    </div>

    <div class="player-section">
      <div class="player-item" v-for="p in players" :key="p.id">
        <span class="status-dot" :class="{ ready: p.connected }"></span>
        <span class="player-name">{{ p.name }}{{ p.isHost ? ' 👑' : '' }}{{ p.isAI ? ' 🤖' : '' }}</span>
        <span v-if="!p.connected" class="managed-tag" title="离线，由系统自动托管">🤖 托管</span>
        <button v-if="isHost && p.isAI" class="remove-ai-btn" @click="removeAI(p.id)">移除</button>
        <span class="player-stats">
          <span v-if="(p.wins ?? 0) > 0 || (p.boxerWins ?? 0) > 0" class="stat-badge">
            🏆{{ p.wins ?? 0 }} 🥊{{ p.boxerWins ?? 0 }}
          </span>
        </span>
      </div>
      <div v-if="players.length === 0" class="empty-hint">等待其他玩家加入...</div>
    </div>

    <div v-if="isHost" class="ai-controls">
      <button class="ai-btn" @click="addAI">＋AI</button>
      <button class="ai-btn fill" @click="fillAI">补满 AI</button>
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
      <p v-if="players.length < 2" class="hint">至少 2 人才能开局</p>
      <p v-else class="hint ready-text">人齐了，任意玩家都可点开局</p>
      <div class="footer-btns">
        <button @click="handleStart" :disabled="players.length < 2" class="ready-btn full-width">开局</button>
      </div>
    </div>
    <ChatPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSocket } from '@/composables/useSocket'
import { useRoom } from '@/composables/useRoom'
import { useGameStore } from '@/stores/game'
import ChatPanel from '@/components/game/ChatPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'

const { connect } = useSocket()
const { roomCode, players, startGame, addAI, fillAI, removeAI, setupListeners, refreshRoom, leaveRoom } = useRoom()
const gameStore = useGameStore()
const auth = useAuthStore()
const route = useRoute()
const copied = ref(false)

onMounted(async () => {
  roomCode.value = (route.params.code as string) || ''
  connect()
  setupListeners()
  if (!auth.user) await auth.loadMe()
  await refreshRoom()
})

const isHost = computed(() => players.value.some(p => p.id === auth.user?.id && p.isHost))
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

function handleStart() { startGame() }
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
.room-topbar { display: flex; margin-bottom: 0.5rem; }
.leave-btn {
  padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 600;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer;
}
.leave-btn:hover { color: #e2e8f0; border-color: rgba(255,255,255,0.25); }
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
.managed-tag {
  font-size: 0.68rem; font-weight: 700; color: #93c5fd;
  background: rgba(96,165,250,0.15); border: 1px solid rgba(96,165,250,0.4);
  border-radius: 6px; padding: 0 0.35rem;
}
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
.ai-controls { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.ai-btn {
  flex: 1; padding: 0.6rem; font-size: 0.85rem; font-weight: 600;
  border: 1px solid rgba(96,165,250,0.4); border-radius: 10px;
  background: rgba(96,165,250,0.12); color: #93c5fd; cursor: pointer; transition: all 0.15s;
}
.ai-btn.fill { border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.12); color: #fbbf24; }
.ai-btn:hover { transform: translateY(-1px); }
.remove-ai-btn {
  padding: 0.15rem 0.5rem; font-size: 0.72rem; border: 1px solid rgba(239,68,68,0.35);
  border-radius: 6px; background: rgba(239,68,68,0.1); color: #f87171; cursor: pointer;
}
</style>
