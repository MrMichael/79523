<template>
  <div v-if="stale" class="update-banner" @click="reload">
    🔄 有新版本，点此刷新
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * A running page never reloads itself, so after a deploy an open tab keeps playing the old
 * bundle until someone refreshes. We fetch the server's build id at page load, re-check it
 * periodically (and whenever the tab comes back), and offer a one-tap refresh — deliberately not
 * an automatic reload, so nobody gets yanked out of a game mid-turn.
 */
const CHECK_MS = 60_000

const stale = ref(false)
let known = ''
let timer: ReturnType<typeof setInterval> | null = null

async function check() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const { buildId } = await res.json()
    if (!buildId) return
    // First successful read = the build this page was loaded with.
    if (!known) { known = buildId; return }
    if (buildId !== known) stale.value = true
  } catch {
    // Dev server has no /version.json, or we're offline — nothing to do.
  }
}

function reload() {
  window.location.reload()
}

function onVisible() {
  if (document.visibilityState === 'visible') void check()
}

onMounted(() => {
  void check()
  timer = setInterval(() => { void check() }, CHECK_MS)
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<style scoped>
.update-banner {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: 1rem; z-index: 500;
  padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer;
  font-size: 0.82rem; font-weight: 700; color: #0f172a;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  animation: update-pop 0.2s ease;
}
@keyframes update-pop { from { opacity: 0; transform: translate(-50%, 6px); } }
</style>
