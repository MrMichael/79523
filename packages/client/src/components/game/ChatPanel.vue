<template>
  <div class="chat-root">
    <button class="chat-fab" :class="{ open }" :title="open ? '收起' : '倾两句'" @click="toggle">
      💬
      <span v-if="!open && store.chatUnread" class="fab-dot">{{ store.chatUnread > 9 ? '9+' : store.chatUnread }}</span>
    </button>

    <div v-if="open" class="chat-panel">
      <div class="chat-head">
        <span>常用语</span>
        <button class="chat-x" @click="toggle">✕</button>
      </div>

      <div ref="logEl" class="chat-log">
        <p v-if="!store.chatMessages.length" class="chat-empty">同枱倾两句啦～</p>
        <p v-for="(m, i) in store.chatMessages" :key="i" class="chat-line">
          <span class="chat-who" :style="{ color: colorOf(m.playerId) }">{{ m.name }}</span>
          <span class="chat-text">{{ m.text }}</span>
        </p>
      </div>

      <div class="chat-quick">
        <button v-for="p in CHAT_PHRASES" :key="p" class="quick-btn" @click="send(p)">{{ p }}</button>
      </div>

      <form class="chat-form" @submit.prevent="send(input)">
        <input
          v-model="input"
          class="chat-input"
          :maxlength="CHAT_MAX_CHARS"
          placeholder="自己打…"
          autocomplete="off"
        />
        <button class="chat-send" type="submit" :disabled="!input.trim()">发送</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSocket } from '@/composables/useSocket'
import { CHAT_PHRASES, CHAT_MAX_CHARS } from '@/chatPhrases'
import { colorForIndex } from '@/playerColors'

const store = useGameStore()
const { sendChat } = useSocket()
const open = ref(false)
const input = ref('')
const logEl = ref<HTMLElement | null>(null)

function toggle() {
  if (open.value) { open.value = false; store.closeChat() }
  else { open.value = true; store.openChat() }
}

function send(text: string) {
  const msg = text.trim()
  if (!msg) return
  sendChat(msg)
  input.value = ''
}

/** Stable per-player colour, so the same speaker keeps the same name colour. */
function colorOf(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return colorForIndex(h)
}

// Keep the newest message in view.
watch(() => store.chatMessages.length, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})
</script>

<style scoped>
.chat-fab {
  position: fixed; right: 0.75rem; bottom: 5.5rem; width: 44px; height: 44px;
  border-radius: 50%; font-size: 1.2rem; cursor: pointer; z-index: 90;
  background: rgba(30,41,59,0.95); border: 1px solid #334155; color: #e2e8f0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.chat-fab.open { background: #1d4ed8; border-color: #3b82f6; }
.fab-dot {
  position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;
  border-radius: 9px; background: #ef4444; color: #fff; font-size: 0.65rem;
  font-weight: 700; line-height: 18px; padding: 0 4px;
}
.chat-panel {
  position: fixed; right: 0.75rem; bottom: 9.5rem; z-index: 95;
  width: min(360px, calc(100vw - 1.5rem)); max-height: 60vh;
  display: flex; flex-direction: column;
  background: rgba(15,23,42,0.98); border: 1px solid #334155; border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.5); padding: 0.5rem; gap: 0.4rem;
}
.chat-head { display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: #cbd5e1; padding: 0 0.15rem; }
.chat-x { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 0.9rem; padding: 0 0.2rem; }
.chat-log { flex: 1; overflow-y: auto; min-height: 70px; max-height: 32vh; display: flex; flex-direction: column; gap: 0.15rem; padding: 0.15rem; }
.chat-empty { color: #64748b; font-size: 0.75rem; text-align: center; margin: 0.5rem 0; }
.chat-line { margin: 0; font-size: 0.78rem; line-height: 1.35; }
.chat-who { font-weight: 700; margin-right: 0.3rem; }
.chat-text { color: #e2e8f0; word-break: break-word; }
.chat-quick { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.quick-btn {
  background: rgba(51,65,85,0.7); border: 1px solid #475569; color: #e2e8f0;
  border-radius: 6px; padding: 0.2rem 0.45rem; font-size: 0.75rem; cursor: pointer;
}
.quick-btn:active { background: #1d4ed8; }
.chat-form { display: flex; gap: 0.25rem; }
.chat-input {
  flex: 1; min-width: 0; background: #0f172a; border: 1px solid #334155; border-radius: 6px;
  color: #e2e8f0; padding: 0.3rem 0.45rem; font-size: 0.8rem;
}
.chat-send {
  background: #1d4ed8; border: none; color: #fff; border-radius: 6px;
  padding: 0.3rem 0.7rem; font-size: 0.8rem; font-weight: 600; cursor: pointer;
}
.chat-send:disabled { opacity: 0.4; cursor: default; }
</style>
