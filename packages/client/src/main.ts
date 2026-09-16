import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installAudioUnlock, loadAudioSettings } from './audio'

loadAudioSettings()
// Browsers only allow audio to start from a user gesture — arm it on the first tap/click/key.
installAudioUnlock()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
