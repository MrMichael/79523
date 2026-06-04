<template>
  <div class="join-room">
    <input v-model="playerName" placeholder="你的昵称" maxlength="12" />
    <input v-model="code" placeholder="房间码（6位）" maxlength="6" style="text-transform: uppercase" />
    <button @click="join" :disabled="!playerName || code.length !== 6">加入房间</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoom } from '@/composables/useRoom'
import { useSocket } from '@/composables/useSocket'

const { connect } = useSocket()
const { joinRoom, setupListeners } = useRoom()
const playerName = ref('')
const code = ref('')

function join() {
  connect()
  setupListeners()
  joinRoom(code.value.toUpperCase(), playerName.value)
}
</script>

<style scoped>
.join-room { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 300px; }
input, button { padding: 0.75rem; font-size: 1rem; border-radius: 8px; border: 1px solid #ccc; }
button { background: #2196F3; color: white; border: none; cursor: pointer; }
button:disabled { background: #ccc; }
</style>
