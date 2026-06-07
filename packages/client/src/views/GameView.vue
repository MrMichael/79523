<template>
  <div class="game-view">
    <GameBoard :players="players" :currentPlayerId="store.currentPlayerId" :playerNames="playerNames"
      @play="onPlay" @pass="onPass" @boxer-move="onBoxerMove" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import GameBoard from '@/components/game/GameBoard.vue'
import { useGame } from '@/composables/useGame'
import { useSocket } from '@/composables/useSocket'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'

const route = useRoute()
const store = useGameStore()
const { socket } = useSocket()
const { players, playerNames, setupListeners, play, pass, boxerMove } = useGame()

onMounted(() => {
  setupListeners()
})

function onPlay(cards: Card[]) { play(cards) }
function onPass() { pass() }
function onBoxerMove(move: string) { boxerMove(move) }
</script>

<style scoped>
.game-view { height: 100%; display: flex; flex-direction: column; }
</style>
