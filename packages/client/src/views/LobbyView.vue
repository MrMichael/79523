<template>
  <div class="lobby">
    <p>大厅（待实现）</p>
    <button @click="logout">登出</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const router = useRouter()
function logout() { auth.logout(); router.push('/login') }
</script>
