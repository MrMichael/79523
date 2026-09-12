<template>
  <div class="leaderboard">
    <div class="metric-tabs">
      <button :class="{ active: metric === 'wins' }" @click="setMetric('wins')">胜局榜</button>
      <button :class="{ active: metric === 'boxerWins' }" @click="setMetric('boxerWins')">拳王榜</button>
      <button :class="{ active: metric === 'wins24h' }" @click="setMetric('wins24h')">近24小时</button>
    </div>
    <div v-for="(u, i) in rows" :key="u.id" class="rank-row">
      <span class="pos">{{ i + 1 }}</span>
      <span class="dot" :class="{ online: u.online }"></span>
      <span class="name">{{ u.username }}</span>
      <template v-if="metric === 'wins24h'">
        <span class="stat">🏆 {{ u.wins24h }}</span>
        <span class="stat">🥊 {{ u.boxerWins24h }}</span>
        <span class="stat">⏱ {{ formatDuration(u.playSeconds24h) }}</span>
      </template>
      <template v-else>
        <span class="stat">🏆 {{ u.wins }}</span>
        <span class="stat">🥊 {{ u.boxerWins }}</span>
      </template>
    </div>
    <p v-if="!rows.length" class="empty">暂无数据</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { apiFetch } from '@/api'
import { formatDuration } from '@/format'

type Metric = 'wins' | 'boxerWins' | 'wins24h'
const metric = ref<Metric>('wins')
const rows = ref<any[]>([])
async function load() { rows.value = await apiFetch(`/api/leaderboard?metric=${metric.value}`) }
function setMetric(m: Metric) { metric.value = m }
onMounted(load)
watch(metric, load)
</script>

<style scoped>
.leaderboard { display: flex; flex-direction: column; gap: 0.4rem; }
.metric-tabs { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.metric-tabs button {
  flex: 1; padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
  background: rgba(255,255,255,0.04); color: #94a3b8; font-weight: 600; cursor: pointer;
}
.metric-tabs button.active { border-color: #fbbf24; color: #fbbf24; background: rgba(251,191,36,0.12); }
.rank-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem; background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 0.85rem; }
.pos { width: 22px; color: #94a3b8; font-weight: 700; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #475569; }
.dot.online { background: #22c55e; }
.name { flex: 1; color: #e2e8f0; }
.stat { color: #94a3b8; font-size: 0.78rem; }
.empty { color: #475569; text-align: center; padding: 0.5rem; }
</style>
