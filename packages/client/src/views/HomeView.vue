<template>
  <div class="home">
    <div class="hero">
      <div class="logo-mark">🃏</div>
      <h1>79523</h1>
      <p class="subtitle">四人以上在线扑克 · 争上游</p>
    </div>
    <div class="forms">
      <CreateRoom />
      <div class="divider"><span>或 加入已有房间</span></div>
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
  min-height: 100%;
  padding: 1.5rem;
  gap: 1.5rem;
}
.hero {
  text-align: center;
  padding: 2rem 0 0.5rem;
}
.logo-mark {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}
.hero h1 {
  font-size: 2.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.subtitle {
  color: #64748b;
  margin-top: 0.4rem;
  font-size: 0.9rem;
}
.forms {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.08);
}
.divider span {
  color: #475569;
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
