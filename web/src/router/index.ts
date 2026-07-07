import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import ChannelPostsView from '../views/ChannelPostsView.vue'
import ChannelsHomeView from '../views/ChannelsHomeView.vue'
import LoginView from '../views/LoginView.vue'
import PostDetailView from '../views/PostDetailView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'home', component: ChannelsHomeView },
    { path: '/channels/:channelId', name: 'channel', component: ChannelPostsView, props: true },
    { path: '/posts/:id', name: 'detail', component: PostDetailView, props: true },
  ],
})

// Без активной сессии любой маршрут уводит на /login (после логина вернём назад).
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.checked) await auth.check()
  if (to.name !== 'login' && !auth.authenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.authenticated) return { path: '/' }
})

export default router
