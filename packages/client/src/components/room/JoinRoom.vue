<template>
  <div class="join-room">
    <label class="field-label">你的昵称</label>
    <input v-model="playerName" placeholder="输入昵称" maxlength="12" class="field-input" />

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
  display: flex; flex-direction: column; gap: 0.7rem;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px; padding: 1.25rem;
}
.field-label { font-size: 0.8rem; font-weight: 600; color: #94a3b8; }
.field-input {
  padding: 0.75rem 0.85rem; font-size: 1rem;
  border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
  background: rgba(255,255,255,0.06); color: #e2e8f0; outline: none;
  transition: border-color 0.2s;
}
.field-input::placeholder { color: #475569; }
.field-input:focus { border-color: #3b82f6; }
.code-input {
  font-size: 1.3rem; letter-spacing: 0.3em; text-align: center;
  font-weight: 700; text-transform: uppercase;
}
.join-btn {
  margin-top: 0.5rem; padding: 0.85rem; font-size: 1rem;
  font-weight: 600; border: none; border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;
  cursor: pointer; transition: all 0.15s;
}
.join-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(59,130,246,0.3); }
.join-btn:disabled { background: rgba(255,255,255,0.06); color: #475569; cursor: not-allowed; transform: none; box-shadow: none; }
</style>
