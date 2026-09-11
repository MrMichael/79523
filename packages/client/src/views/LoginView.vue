<template>
  <div class="login">
    <div class="hero">
      <div class="logo-mark">🃏</div>
      <h1>烟三文四</h1>
      <p class="subtitle">在线扑克 · 争上游</p>
    </div>
    <div class="card">
      <p class="mode">{{ mode === 'login' ? '登录' : '注册' }}</p>
      <input v-model="username" placeholder="用户名（3-20 位字母/数字/下划线）" maxlength="20" class="field" />
      <input v-model="password" type="password" placeholder="密码（至少 6 位）" class="field" @keyup.enter="submit" />
      <button class="submit" :disabled="!username || !password" @click="submit">
        {{ mode === 'login' ? '登录' : '注册' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
      <a class="toggle" @click="toggle">{{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const error = ref('')

function toggle() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}

async function submit() {
  if (!username.value || !password.value) return
  error.value = ''
  try {
    if (mode.value === 'login') await auth.login(username.value, password.value)
    else await auth.register(username.value, password.value)
    router.push('/lobby')
  } catch (e: any) {
    error.value = e.message || '失败'
  }
}
</script>

<style scoped>
.login { display: flex; flex-direction: column; gap: 1.5rem; padding: 2.5rem 1.5rem; max-width: 420px; margin: 0 auto; }
.hero { text-align: center; }
.logo-mark { font-size: 3rem; }
.hero h1 {
  font-size: 2.4rem; font-weight: 800; letter-spacing: 0.12em;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.subtitle { color: #64748b; margin-top: 0.4rem; font-size: 0.9rem; }
.card {
  display: flex; flex-direction: column; gap: 0.75rem;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px; padding: 1.5rem;
}
.mode { font-weight: 700; color: #e2e8f0; }
.field {
  padding: 0.75rem 0.85rem; font-size: 0.95rem; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; background: rgba(255,255,255,0.06); color: #e2e8f0; outline: none;
}
.field:focus { border-color: #fbbf24; }
.submit {
  margin-top: 0.25rem; padding: 0.85rem; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 12px; background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #1a1a1a; cursor: pointer;
}
.submit:disabled { background: rgba(255,255,255,0.06); color: #475569; cursor: not-allowed; }
.error { color: #f87171; font-size: 0.82rem; }
.toggle { color: #93c5fd; font-size: 0.82rem; cursor: pointer; text-align: center; }
</style>
