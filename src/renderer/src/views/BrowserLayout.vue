<template>
  <div class="browser-layout">
    
    <BrowserTitleBar />

    <div class="webview-wrapper">
      <div 
        v-if="preloadPath" 
        v-for="tab in tabs" 
        :key="tab.id"
        class="webview-container"
        v-show="currentTabId === tab.id"
      >
        <webview
          :src="tab.src"
          :preload="preloadPath"
          class="neis-webview"
          allowpopups
          disablewebsecurity
          @did-finish-load="onWebviewLoad(tab)"
          :ref="(el) => { if(el) tab.webview = el }" 
          @did-start-loading="updateTitle(tab, '로딩중...')"
          @page-title-updated="(e) => updateTitle(tab, e.title)"
          webpreferences="contextIsolation=true, nodeIntegration=false"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ></webview>
      </div>
    </div>

    <MenuSearchModal
      v-if="isSearchOpen"
      :menu-list="menuData"
      @close="isSearchOpen = false"
      @execute="executeMenu"
    />

    <LoginModal 
      v-if="showLoginModal"
      :form="loginForm"
      @update:id="loginForm.id = $event"
      @update:password="loginForm.password = $event"
      @save="saveLoginInfo"
      @close="showLoginModal = false"
    />

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

// 컴포넌트 임포트
import BrowserTitleBar from '../components/BrowserTitleBar.vue';
import LoginModal from '../components/LoginModal.vue';
import MenuSearchModal from '../components/MenuSearchModal.vue';

// 로직(Composables) 임포트
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';
import { useMenuSearch } from '../composables/useMenuSearch';
const { 
  menuData, isSearchOpen, setupMenuListeners, executeMenu, autoFetchMenuData 
} = useMenuSearch();

const router = useRouter();
const preloadPath = ref('');

// [수정] 웹뷰 로딩 완료 핸들러
const onWebviewLoad = (tab) => {
  const title = tab.title || '';
  console.log(`Vue: 탭 로딩됨 [${title}]`);
  
  if (title.includes('나이스') || title.includes('업무포털') || title.includes('NEIS')) {
     console.log('Vue: 메인 화면 감지! 데이터 수집 및 포커스 설정');
     
     // 1. 데이터 수집 시작
     autoFetchMenuData(true); 

     // 2. ★★★ [추가] 강제 포커스 (브라우저 깨우기) ★★★
     if (tab.webview) {
       tab.webview.focus(); // 웹뷰 엘리먼트에 포커스
     }
  }
};

// 1. 탭 관리 로직 (웹뷰 Ref 관리 포함)
const { 
  tabs, currentTabId, createTab, updateTitle, getActiveWebview 
} = useTabs();

// 2. 비밀번호/보안 로직 (getActiveWebview 주입)
const { 
  showLoginModal, loginForm, loadSavedPassword, saveLoginInfo, setupPasswordListeners 
} = usePassword(getActiveWebview);

// 3. 초기화 및 이벤트 연결
onMounted(async () => {

  setupMenuListeners();

  // (1) Preload 파일 경로 확보 (필수)
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      // 윈도우 경로(\)를 브라우저 URL(/)로 변환하고 file:/// 프로토콜 붙임
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
      console.log('Vue: Preload 경로 설정 완료 ->', preloadPath.value);
    } catch (e) {
      console.error('Preload 경로 로드 실패:', e);
    }
  }

  // (2) 지역 설정 확인 및 첫 탭 생성
  const savedData = localStorage.getItem('user_region');
  if (!savedData) {
    router.push({ name: 'SelectRegion' });
    return;
  }
  const region = JSON.parse(savedData);
  
  if (tabs.value.length === 0) {
    createTab(region.url, `${region.name} 업무포털`);
  }

  // (3) 비밀번호 로직 초기화
  await loadSavedPassword(); // 저장된 비번 불러오기
  setupPasswordListeners();  // ★ 하드웨어 타이핑 리스너 등록 (Main -> Vue -> Webview)

  // (4) 탭 생성 요청 리스너 (Main -> Vue)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('request-new-tab', (...args) => {
      const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
      if (foundUrl) {
        console.log('Vue: 새 탭 요청 수신 ->', foundUrl);
        createTab(foundUrl, '로딩중...');
      }
    });
  }
});
</script>

<style scoped>
/* 전체 레이아웃 */
.browser-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f3f3f3;
}

/* 웹뷰 영역 */
.webview-wrapper {
  flex: 1;
  background: white;
  position: relative;
  box-shadow: 0 -2px 5px rgba(0,0,0,0.02);
}

.webview-container {
  width: 100%;
  height: 100%;
}

.neis-webview {
  width: 100%;
  height: 100%;
  border: none;
}
</style>