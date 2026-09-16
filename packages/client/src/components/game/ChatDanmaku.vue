<template>
  <div class="danmaku-layer" aria-hidden="true">
    <span
      v-for="d in items"
      :key="d.key"
      class="danmaku-item"
      :class="{ system: d.system }"
      :style="{ top: `${d.lane * 22}px`, animationDuration: `${DURATION}ms` }"
    >
  <span class="dm-name" v-if="!d.system" :style="{ color: d.color }">{{ d.name }}</span>{{ d.text }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { colorForId } from '@/playerColors'

/** How long a bullet takes to cross the screen. */
const DURATION = 7000
/** Lanes messages are handed out to (round-robin), so simultaneous ones don't overlap. */
const LANES = 2

const store = useGameStore()
const items = ref<{ key: number; name: string; text: string; color: string; lane: number; system?: boolean }[]>([])
let seq = 0
let lane = 0
// Anything already in the log happened before we got here (reload / reconnect) — skip it, so it
// isn't replayed as a screenful of bullets the next time someone speaks.
let lastIndex = store.chatMessages.length

// Show each new chat message once, as a bullet across the top of the board.
watch(() => store.chatMessages.length, (len) => {
  if (len < lastIndex) lastIndex = 0 // log was cleared (new game)
  for (let i = lastIndex; i < len; i++) {
    const m = store.chatMessages[i]
    const key = ++seq
    items.value.push({ key, name: m.name, text: m.text, color: colorForId(m.playerId), lane: lane++ % LANES, system: m.system })
    setTimeout(() => { items.value = items.value.filter(d => d.key !== key) }, DURATION)
  }
  lastIndex = len
})
</script>

<style scoped>
.danmaku-layer {
  position: absolute; top: 0; left: 0; right: 0; height: 46px;
  overflow: hidden; pointer-events: none; z-index: 60;
}
.danmaku-item {
  position: absolute; left: 100%; white-space: nowrap;
  font-size: 0.9rem; font-weight: 700; color: #fff;
  text-shadow: 0 1px 3px #000, 0 0 6px rgba(0, 0, 0, 0.85);
  animation-name: danmaku-move; animation-timing-function: linear; animation-fill-mode: forwards;
  will-change: transform;
}
.dm-name { margin-right: 0.4rem; }
/* System notices (e.g. "某人上线了") — no speaker name, tinted so they read as announcements. */
.danmaku-item.system { color: #fbbf24; }
@keyframes danmaku-move {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-100% - 100vw)); }
}
</style>
