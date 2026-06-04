<template>
  <div class="turn-indicator" v-if="isMyTurn">⏱ 你的回合 {{ timeLeft }}s</div>
  <div class="turn-indicator wait" v-else>等待 {{ currentPlayer }} 出牌...</div>
</template>

<script setup lang="ts">
defineProps<{ isMyTurn: boolean; currentPlayer: string; timeLeft: number }>()
</script>

<style scoped>
.turn-indicator { text-align: center; padding: 0.5rem; font-weight: bold; background: #4CAF50; color: white; }
.turn-indicator.wait { background: #FF9800; }
</style>
