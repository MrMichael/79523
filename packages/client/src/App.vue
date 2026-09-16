<template>
  <div class="app-shell">
    <header v-if="showNav" class="top-bar">
      <button class="back-btn" @click="goHome">← 首页</button>
      <span v-if="roomCode" class="bar-code">{{ roomCode }}</span>
      <span class="bar-spacer" v-else></span>
      <span class="bar-title">烟三文四</span>
      <RefreshButton />
    </header>
    <main class="app-main">
      <router-view />
    </main>
    <UpdateBanner />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoom } from '@/composables/useRoom'
import UpdateBanner from '@/components/common/UpdateBanner.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'

const route = useRoute()
const router = useRouter()
const { roomCode } = useRoom()

const showNav = computed(() => route.path !== '/login' && route.path !== '/lobby')

function goHome() { router.push('/') }
</script>

<style>
/* Global reset & base */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
body {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  color: #e2e8f0;
  -webkit-tap-highlight-color: transparent;
}
input { font-family: inherit; }
button { font-family: inherit; cursor: pointer; }
</style>

<style scoped>
.app-shell { display: flex; flex-direction: column; height: 100%; max-width: 480px; margin: 0 auto; }

.top-bar {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
  background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; z-index: 50;
}
.back-btn {
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
  color: #94a3b8; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.8rem;
  font-weight: 500; transition: all 0.15s;
}
.back-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
.bar-code {
  font-size: 0.95rem; font-weight: 700; letter-spacing: 0.15em;
  color: #fbbf24; padding: 0.2rem 0.6rem; background: rgba(251,191,36,0.1);
  border-radius: 6px;
}
.bar-spacer { flex: 1; }
.bar-title {
  font-size: 0.85rem; font-weight: 800; letter-spacing: 0.1em; color: rgba(255,255,255,0.3);
}
.app-main { flex: 1; overflow-y: auto; }
</style>
