<template>
  <div class="home">
    <h1>79523</h1>
    <CreateRoom />
    <JoinRoom />
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
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 2rem;
  padding: 2rem;
}
h1 { font-size: 3rem; }
</style>
