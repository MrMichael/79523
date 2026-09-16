<template>
  <div class="game-view">
    <div class="game-topbar">
      <button class="leave-btn" @click="onLeave">← 退出</button>
    </div>
    <button
      class="managed-btn"
      :class="{ on: iAmManaged }"
      :title="iAmManaged ? '系统正在帮你出牌，点一下收回' : '临时有事？点一下让系统帮你出牌'"
      @click="toggleManaged"
    >{{ iAmManaged ? '🤖 托管中' : '🤖 托管' }}</button>
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
const { leaveRoom, roomCode, setupListeners, setManaged, requestSync } = useRoom()

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
  // 进入对局页主动要一次状态：手牌/桌面/轮次即使错过事件也能补齐
  requestSync()
})

function onPlay(cards: Card[]) { play(cards) }
function onPass() { pass() }
function onBoxerMove(move: string) { boxerMove(move) }
function onLeave() { if (confirm('退出将放弃本局，确定吗？')) leaveRoom() }
</script>

<style scoped>
.game-view { height: 100%; display: flex; flex-direction: column; }
.game-topbar { display: flex; align-items: center; padding: 0.4rem 0.6rem; }
/* 左下角悬浮：右上角被「排名榜」占着（ScorePopup 固定 top:50px/right:8px），与右下角的 💬 对称。
   抬到手牌区上方（手牌多时会横向滚动、左边第一张会顶到屏幕左侧）。 */
.managed-btn {
  position: fixed; left: 0.75rem; bottom: 9.75rem; z-index: 90;
  padding: 0.5rem 0.8rem; font-size: 0.8rem; font-weight: 600; line-height: 1;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 22px;
  background: rgba(30,41,59,0.95); color: #94a3b8; cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.managed-btn.on { background: #1d4ed8; border-color: #3b82f6; color: #fff; }
.leave-btn {
  padding: 0.3rem 0.7rem; font-size: 0.75rem; font-weight: 600;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer;
}
.leave-btn:hover { color: #e2e8f0; border-color: rgba(255,255,255,0.25); }
</style>
