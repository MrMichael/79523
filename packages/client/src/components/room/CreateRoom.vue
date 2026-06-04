<template>
  <div class="create-room">
    <input v-model="playerName" placeholder="你的昵称" maxlength="12" />
    <select v-model.number="maxPlayers">
      <option :value="2">2 人</option>
      <option :value="3">3 人</option>
      <option :value="4" selected>4 人</option>
      <option :value="5">5 人</option>
      <option :value="6">6 人</option>
    </select>
    <button @click="create" :disabled="!playerName">创建房间</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoom } from '@/composables/useRoom'
import { useSocket } from '@/composables/useSocket'

const { connect } = useSocket()
const { createRoom, setupListeners } = useRoom()
const playerName = ref('')
const maxPlayers = ref(4)

function create() {
  connect()
  setupListeners()
  createRoom(playerName.value, maxPlayers.value)
}
</script>

<style scoped>
.create-room { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 300px; }
input, select, button { padding: 0.75rem; font-size: 1rem; border-radius: 8px; border: 1px solid #ccc; }
button { background: #4CAF50; color: white; border: none; cursor: pointer; }
button:disabled { background: #ccc; }
</style>
