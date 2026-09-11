import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/api'
import LoginView from '@/views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/lobby' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/lobby', name: 'lobby', component: () => import('@/views/LobbyView.vue') },
    { path: '/room/:code', name: 'room', component: () => import('@/views/RoomView.vue') },
    { path: '/game/:code', name: 'game', component: () => import('@/views/GameView.vue') },
  ],
})

router.beforeEach((to) => {
  const authed = !!getToken()
  if (!authed && to.path !== '/login') return '/login'
  if (authed && to.path === '/login') return '/lobby'
})

export default router
