import { createRouter, createWebHistory } from 'vue-router'
import ChannelPostsView from '../views/ChannelPostsView.vue'
import ChannelsHomeView from '../views/ChannelsHomeView.vue'
import PostDetailView from '../views/PostDetailView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: ChannelsHomeView },
    { path: '/channels/:channelId', name: 'channel', component: ChannelPostsView, props: true },
    { path: '/posts/:id', name: 'detail', component: PostDetailView, props: true },
  ],
})

export default router
