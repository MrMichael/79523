<template>
  <div class="home">
    <div class="logo">
      <h1>79523</h1>
      <p class="subtitle">四人以上在线扑克</p>
    </div>
    <div class="forms">
      <CreateRoom />
      <div class="divider"><span>或</span></div>
      <JoinRoom />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateRoom from '@/components/room/CreateRoom.vue'
import JoinRoom from '@/components/room/JoinRoom.vue'
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
.logo { text-align: center; padding: 3rem 0 2rem; }
.logo h1 { font-size: 3.5rem; font-weight: 800; letter-spacing: 0.1em; }
.subtitle { color: #888; margin-top: 0.5rem; }
.forms { flex: 1; }
.divider { display: flex; align-items: center; gap: 1rem; padding: 1.2rem 0; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e0e0e0; }
.divider span { color: #aaa; font-size: 0.85rem; }
</style>
