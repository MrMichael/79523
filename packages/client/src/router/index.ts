import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/room/:code', name: 'room', component: () => import('@/views/RoomView.vue') },
    { path: '/game/:code', name: 'game', component: () => import('@/views/GameView.vue') },
  ],
})

export default router
