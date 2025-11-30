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

    <LoginModal 
      v-if="showLoginModal"
      :form="loginForm"
      @update:id="loginForm.id = $event"
      @update:password="loginForm.password = $event"
      @save="saveLoginInfo"
      @close="showLoginModal = false"
    />

    <MenuSearchModal
      v-if="isSearchOpen"
      :menu-list="menuData"
      @close="isSearchOpen = false"
      @execute="executeMenu"
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

const router = useRouter();
const preloadPath = ref('');

// 1. 탭 로직
const { 
  tabs, currentTabId, createTab, updateTitle, getActiveWebview 
} = useTabs();

// 2. 비밀번호 로직
const { 
  showLoginModal, loginForm, loadSavedPassword, saveLoginInfo, setupPasswordListeners 
} = usePassword(getActiveWebview);

// 3. 메뉴 검색 로직 (autoFetchMenuData 포함)
const { 
  menuData, isSearchOpen, setupMenuListeners, executeMenu, autoFetchMenuData 
} = useMenuSearch();

// 4. 웹뷰 로딩 완료 핸들러 (자동 수집 시작)
const onWebviewLoad = (tab) => {
  const title = tab.title || '';
  if (title.includes('나이스') || title.includes('업무포털') || title.includes('NEIS')) {
     console.log('Vue: 메인 화면 감지 -> 데이터 수집 시작');
     if(autoFetchMenuData) autoFetchMenuData(true);
     if(tab.webview) tab.webview.focus();
  }
};

// 5. 초기화
onMounted(async () => {
  setupMenuListeners();     // 단축키 리스너
  setupPasswordListeners(); // 비밀번호 입력 리스너

  // Preload 경로
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
      console.log('Vue: Preload 경로 ->', preloadPath.value);
    } catch (e) { console.error(e); }
  }

  // 탭 생성
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  if (tabs.value.length === 0) createTab(region.url, `${region.name} 업무포털`);

  // 비밀번호 로드
  await loadSavedPassword();

  // 탭 생성 요청 리스너
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('request-new-tab', (...args) => {
      const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
      if (foundUrl) createTab(foundUrl, '로딩중...');
    });
  }
});
</script>

<style scoped>
.browser-layout { display: flex; flex-direction: column; height: 100vh; background: #f3f3f3; }
.webview-wrapper { flex: 1; background: white; position: relative; box-shadow: 0 -2px 5px rgba(0,0,0,0.02); }
.webview-container { width: 100%; height: 100%; }
.neis-webview { width: 100%; height: 100%; border: none; }
</style>