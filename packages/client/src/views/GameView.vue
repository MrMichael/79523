<template>
  <div class="game-view">
    <div class="game-topbar">
      <button class="leave-btn" @click="onLeave">← 退出</button>
      <span class="topbar-spacer" />
      <button
        class="managed-btn"
        :class="{ on: iAmManaged }"
        :title="iAmManaged ? '系统正在帮你出牌，点一下收回' : '临时有事？点一下让系统帮你出牌'"
        @click="toggleManaged"
      >{{ iAmManaged ? '🤖 托管中' : '🤖 托管' }}</button>
    </div>
    <GameBoard :players="players" :currentPlayerId="store.currentPlayerId" :playerNames="playerNames"
      @play="onPlay" @pass="onPass" @boxer-move="onBoxerMove" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import GameBoard from '@/components/game/GameBoard.vue'
import { useGame } from '@/composables/useGame'
import { useRoom } from '@/composables/useRoom'
import { useSocket } from '@/composables/useSocket'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'

const route = useRoute()
const store = useGameStore()
const { connect } = useSocket()
const { players, playerNames, play, pass, boxerMove } = useGame()
const { leaveRoom, roomCode, setupListeners, setManaged } = useRoom()

// 托管状态跟着全桌广播走，刷新/重连后也能正确反映。
const iAmManaged = computed(() => !!players.value.find(p => p.id === store.myId)?.managed)
function toggleManaged() { setManaged(!iAmManaged.value) }

onMounted(() => {
  // Record the room code so room-scoped events (e.g. next_game_lead after a reconnect) can route back.
  roomCode.value = (route.params.code as string) || ''
  // The game view can be the entry point after a mobile page reload, so ensure the socket
  // exists and BOTH room + game listeners are registered (setupListeners is idempotent).
  connect()
  setupListeners()
})

function onPlay(cards: Card[]) { play(cards) }
function onPass() { pass() }
function onBoxerMove(move: string) { boxerMove(move) }
function onLeave() { if (confirm('退出将放弃本局，确定吗？')) leaveRoom() }
</script>

<style scoped>
.game-view { height: 100%; display: flex; flex-direction: column; }
.game-topbar { display: flex; align-items: center; padding: 0.4rem 0.6rem; }
.topbar-spacer { flex: 1; }
.managed-btn {
  padding: 0.35rem 0.7rem; font-size: 0.78rem; font-weight: 600;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer;
}
.managed-btn.on { background: rgba(96,165,250,0.18); border-color: rgba(96,165,250,0.5); color: #93c5fd; }
.leave-btn {
  padding: 0.3rem 0.7rem; font-size: 0.75rem; font-weight: 600;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer;
}
.leave-btn:hover { color: #e2e8f0; border-color: rgba(255,255,255,0.25); }
</style>
