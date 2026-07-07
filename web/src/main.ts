import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'
import { createPinia } from 'pinia'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createApp } from 'vue'
import App from './App.vue'
import { setOnUnauthorized } from './api/client.js'
import router from './router/index.js'
import { useAuthStore } from './stores/auth.js'
import './style.css'

const IndigoDark = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
  },
})

document.documentElement.classList.add('app-dark')

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Протухшая сессия: 401 вне /auth/* сбрасывает auth-стор и уводит на /login.
setOnUnauthorized(() => {
  useAuthStore().reset()
  router.push({ name: 'login' })
})
app.use(PrimeVue, {
  theme: { preset: IndigoDark, options: { darkModeSelector: '.app-dark', cssLayer: false } },
})
app.use(ToastService)
app.mount('#app')
