<template>
  <div class="create-room">
    <label class="field-label">你的昵称</label>
    <input v-model="playerName" placeholder="输入昵称" maxlength="12" class="field-input" />

    <label class="field-label">玩家人数</label>
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
.field-input:focus { border-color: #fbbf24; }
.player-count-group { display: flex; gap: 0.4rem; }
.count-btn {
  flex: 1; padding: 0.5rem 0; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; background: rgba(255,255,255,0.04); color: #94a3b8;
  font-size: 0.85rem; cursor: pointer; transition: all 0.15s;
}
.count-btn.active { border-color: #fbbf24; background: rgba(251,191,36,0.15); color: #fbbf24; }
.count-btn:hover:not(.active) { background: rgba(255,255,255,0.08); }
.create-btn {
  margin-top: 0.5rem; padding: 0.85rem; font-size: 1rem;
  font-weight: 600; border: none; border-radius: 12px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1a1a1a;
  cursor: pointer; transition: all 0.15s;
}
.create-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(251,191,36,0.3); }
.create-btn:disabled { background: rgba(255,255,255,0.06); color: #475569; cursor: not-allowed; transform: none; box-shadow: none; }
</style>
