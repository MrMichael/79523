<template>
  <div class="create-room">
    <label class="field-label">昵称</label>
    <input v-model="playerName" placeholder="输入你的昵称" maxlength="12" class="field-input" />

    <label class="field-label">人数</label>
    <div class="player-count-group">
      <button v-for="n in [2,3,4,5,6]" :key="n"
        class="count-btn" :class="{ active: maxPlayers === n }"
        @click="maxPlayers = n">{{ n }}人</button>
    </div>

    <button @click="create" :disabled="!playerName" class="create-btn">创建房间</button>
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
.create-room {
  display: flex; flex-direction: column; gap: 0.6rem;
  background: #f8f9fa; border-radius: 14px; padding: 1.25rem;
}
.field-label { font-size: 0.85rem; font-weight: 600; color: #555; }
.field-input {
  padding: 0.85rem; font-size: 1rem; border: 2px solid #e0e0e0;
  border-radius: 10px; background: white; outline: none;
}
.field-input:focus { border-color: #4caf50; }
.player-count-group { display: flex; gap: 0.4rem; }
.count-btn {
  flex: 1; padding: 0.5rem 0; border: 2px solid #e0e0e0;
  border-radius: 8px; background: white; font-size: 0.9rem; cursor: pointer;
}
.count-btn.active { border-color: #4caf50; background: #4caf50; color: white; }
.create-btn {
  margin-top: 0.5rem; padding: 0.9rem; font-size: 1.05rem;
  font-weight: 600; border: none; border-radius: 12px;
  background: #4caf50; color: white; cursor: pointer;
}
.create-btn:disabled { background: #ccc; cursor: not-allowed; }
</style>
