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

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

// 컴포넌트 임포트
import BrowserTitleBar from '../components/BrowserTitleBar.vue';
import LoginModal from '../components/LoginModal.vue';

// 로직 임포트
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';

const router = useRouter();
const preloadPath = ref('');

// 탭 상태 (웹뷰 렌더링용)
const { 
  tabs, currentTabId, createTab, updateTitle, getActiveWebview 
} = useTabs();

// 비밀번호 상태 (모달 렌더링 및 이벤트 수신용)
const { 
  showLoginModal, loginForm, loadSavedPassword, saveLoginInfo, setupPasswordListeners 
} = usePassword(getActiveWebview);

// 초기화 로직
onMounted(async () => {
  // 1. Preload 경로
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
    } catch (e) { console.error(e); }
  }

  // 2. 지역/탭
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  if (tabs.value.length === 0) createTab(region.url, `${region.name} 업무포털`);

  // 3. 로직 초기화
  await loadSavedPassword();
  setupPasswordListeners();

  // 4. 탭 생성 리스너
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('request-new-tab', (...args) => {
      const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
      if (foundUrl) createTab(foundUrl, '로딩중...');
    });
  }
});
</script>

<style scoped>
/* 레이아웃 배치용 스타일만 남음 */
.browser-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f3f3f3;
}

.webview-wrapper {
  flex: 1;
  background: white;
  position: relative;
  box-shadow: 0 -2px 5px rgba(0,0,0,0.02);
}
.webview-container { width: 100%; height: 100%; }
.neis-webview { width: 100%; height: 100%; border: none; }
</style>