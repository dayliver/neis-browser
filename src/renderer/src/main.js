//import './assets/main.css'

//import { createApp } from 'vue'
//import App from './App.vue'

//createApp(App).mount('#app')


import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 방금 만든 라우터 가져오기
//import './style.css' // (기존 스타일 파일이 있다면)

const app = createApp(App)

app.use(router) // 라우터 사용 등록
app.mount('#app')
