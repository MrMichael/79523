<template>
  <div class="join-room">
    <label class="field-label">昵称</label>
    <input v-model="playerName" placeholder="输入你的昵称" maxlength="12" class="field-input" />

    <label class="field-label">房间码</label>
    <input v-model="code" placeholder="输入6位房间码" maxlength="6"
      class="field-input code-input" @input="code = code.toUpperCase()" />

    <button @click="join" :disabled="!playerName || code.length !== 6" class="join-btn">加入房间</button>
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
  joinRoom(code.value, playerName.value)
}
</script>

<style scoped>
.join-room {
  display: flex; flex-direction: column; gap: 0.6rem;
  background: #f8f9fa; border-radius: 14px; padding: 1.25rem;
}
.field-label { font-size: 0.85rem; font-weight: 600; color: #555; }
.field-input {
  padding: 0.85rem; font-size: 1rem; border: 2px solid #e0e0e0;
  border-radius: 10px; background: white; outline: none;
}
.field-input:focus { border-color: #2196f3; }
.code-input {
  font-size: 1.3rem; letter-spacing: 0.3em; text-align: center;
  font-weight: 700; text-transform: uppercase;
}
.join-btn {
  margin-top: 0.5rem; padding: 0.9rem; font-size: 1.05rem;
  font-weight: 600; border: none; border-radius: 12px;
  background: #2196f3; color: white; cursor: pointer;
}
.join-btn:disabled { background: #ccc; cursor: not-allowed; }
</style>
