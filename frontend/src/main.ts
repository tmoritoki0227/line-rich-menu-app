import { createApp } from 'vue'
import './style.css'
import AppShell from './AppShell.vue'
import router from './router'

createApp(AppShell).use(router).mount('#app')
