<template>
  <div class="game-view">
    <GameBoard />
  </div>
</template>

<script setup lang="ts">
import GameBoard from '@/components/game/GameBoard.vue'
</script>

<style scoped>
.game-view { height: 100%; display: flex; flex-direction: column; }
</style>
