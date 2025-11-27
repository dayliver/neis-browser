import { createRouter, createWebHashHistory } from 'vue-router'

// 컴포넌트 임포트 (경로가 맞는지 확인하세요)
import SelectRegion from '../views/SelectRegion.vue'
import BrowserLayout from '../views/BrowserLayout.vue'

const routes = [
  {
    path: '/',
    name: 'Browser',
    component: BrowserLayout
  },
  {
    path: '/select-region',
    name: 'SelectRegion',
    component: SelectRegion
  }
]

const router = createRouter({
  // Electron은 파일 시스템 기반이므로 Hash 모드가 안전합니다.
  history: createWebHashHistory(),
  routes
})

// 네비게이션 가드 (로그인 체크 로직)
router.beforeEach((to, from, next) => {
  const savedRegion = localStorage.getItem('user_region');

  if (!savedRegion && to.name !== 'SelectRegion') {
    // 저장된 지역이 없으면 선택 페이지로
    next({ name: 'SelectRegion' });
  } else {
    next();
  }
});

export default router