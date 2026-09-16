<template>
  <button class="refresh-btn" title="刷新页面" @click="reload">🔄</button>
</template>

<script setup lang="ts">
/**
 * One-tap page reload. Safe to press mid-game: on reconnect the client asks the server to restore
 * its seat (see `sync_me`), so the hand, table and turn all come back.
 */
function reload() {
  window.location.reload()
}
</script>

<style scoped>
.refresh-btn {
  padding: 0.35rem 0.5rem; font-size: 0.9rem; line-height: 1;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer;
}
.refresh-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
</style>
