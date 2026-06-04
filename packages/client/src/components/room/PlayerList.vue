<template>
  <div class="player-list">
    <div v-for="player in players" :key="player.id" class="player-item">
      <span class="status" :class="{ ready: player.ready }">●</span>
      <span>{{ player.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ players: { id: string; name: string; ready: boolean }[] }>()
</script>

<style scoped>
.player-list { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 300px; }
.player-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #f5f5f5; border-radius: 8px; }
.status { color: #ccc; }
.status.ready { color: #4CAF50; }
</style>
