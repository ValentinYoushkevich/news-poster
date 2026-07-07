import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { config } from '@vue/test-utils'

// Глобально подключаем PrimeVue для всех mount() в тестах.
config.global.plugins = [[PrimeVue, {}], ToastService]
