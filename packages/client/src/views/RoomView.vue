<template>
  <div class="room">
    <div class="room-header">
      <h2>房间</h2>
      <div class="code-display">
        <span class="code-text">{{ roomCode }}</span>
        <button class="copy-btn" @click="copyCode">复制</button>
      </div>
      <p class="share-hint">把房间码发给好友，他们在首页输入即可加入</p>
    </div>

    <div class="player-section">
      <div class="player-item" v-for="p in players" :key="p.id">
        <span class="status-dot" :class="{ ready: p.ready, connected: p.connected }"></span>
        <span class="player-name">{{ p.name }}</span>
        <span class="player-state">{{ p.ready ? '✓ 已准备' : '等待中...' }}</span>
      </div>
      <div v-if="players.length === 0" class="empty-hint">等待其他玩家加入...</div>
    </div>

    <div class="room-footer">
      <p v-if="!amReady" class="hint">所有人准备后自动开始</p>
      <p v-else class="hint ready-text">已准备，等待其他玩家...</p>
      <button @click="handleReady" :disabled="amReady" class="ready-btn">
        {{ amReady ? '已准备' : '准备' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSocket } from '@/composables/useSocket'
import { useRoom } from '@/composables/useRoom'

const { connect } = useSocket()
const { roomCode, players, amReady, ready, setupListeners } = useRoom()

onMounted(() => {
  connect()
  setupListeners()
})

function handleReady() {
  ready()
}

function copyCode() {
  navigator.clipboard.writeText(roomCode.value)
}
</script>

<style scoped>
.room {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 1.5rem;
}
.room-header {
  text-align: center;
  margin-bottom: 1.5rem;
}
.room-header h2 {
  font-size: 1.3rem;
  margin-bottom: 0.75rem;
}
.code-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.code-text {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.25em;
  color: #333;
}
.copy-btn {
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  border: 2px solid #2196f3;
  border-radius: 8px;
  background: white;
  color: #2196f3;
  cursor: pointer;
  font-weight: 600;
}
.share-hint {
  font-size: 0.8rem;
  color: #999;
  margin-top: 0.75rem;
}
.player-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.player-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  background: #f8f9fa;
  border-radius: 10px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ccc;
  flex-shrink: 0;
}
.status-dot.connected {
  background: #ff9800;
}
.status-dot.ready {
  background: #4caf50;
}
.player-name {
  font-weight: 600;
  flex: 1;
}
.player-state {
  font-size: 0.85rem;
  color: #888;
}
.empty-hint {
  text-align: center;
  color: #aaa;
  padding: 2rem;
}
.room-footer {
  text-align: center;
  padding-top: 1rem;
}
.hint {
  font-size: 0.9rem;
  color: #888;
  margin-bottom: 0.75rem;
}
.ready-text {
  color: #4caf50;
}
.ready-btn {
  width: 100%;
  padding: 0.9rem;
  font-size: 1.1rem;
  border: none;
  border-radius: 12px;
  background: #4caf50;
  color: white;
  cursor: pointer;
  font-weight: 600;
}
.ready-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
