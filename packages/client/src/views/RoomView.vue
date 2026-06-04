<template>
  <div class="room">
    <h2>Room: {{ code }}</h2>
    <PlayerList :players="players" />
    <p v-if="!amReady">Waiting for all players to ready...</p>
    <button @click="ready" :disabled="amReady">Ready</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import PlayerList from '@/components/room/PlayerList.vue'

const route = useRoute()
const code = route.params.code as string
const players = ref<any[]>([])
const amReady = ref(false)

function ready() { amReady.value = true }
</script>

<style scoped>
.room { padding: 2rem; }
</style>
