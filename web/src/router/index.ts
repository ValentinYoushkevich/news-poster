import { createRouter, createWebHistory } from 'vue-router'
import PostDetailView from '../views/PostDetailView.vue'
import PostListView from '../views/PostListView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'list', component: PostListView },
    { path: '/posts/:id', name: 'detail', component: PostDetailView, props: true },
  ],
})

export default router
