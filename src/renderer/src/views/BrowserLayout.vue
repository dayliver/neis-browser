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
          @did-start-navigation="onNavStart(tab, $event)"
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
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

// 컴포넌트 임포트
import BrowserTitleBar from '../components/BrowserTitleBar.vue';
import LoginModal from '../components/LoginModal.vue';
import MenuSearchModal from '../components/MenuSearchModal.vue';

// 로직(Composables) 임포트
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';
import { useMenuSearch } from '../composables/useMenuSearch';
import { useScriptExecutor } from '../composables/useScriptExecutor'; // ★ 실행기 추가

const router = useRouter();
const preloadPath = ref('');

const { tabs, currentTabId, createTab, updateTitle, getActiveWebview } = useTabs();
const { showLoginModal, loginForm, loadSavedPassword, saveLoginInfo, setupPasswordListeners } = usePassword(getActiveWebview);
const { menuData, isSearchOpen, setupMenuListeners, executeMenu, autoFetchMenuData } = useMenuSearch();
const { runRemoteScript } = useScriptExecutor(); // ★ 실행기 사용

// 1. 웹뷰 로딩 핸들러
const onWebviewLoad = (tab) => {
  let currentTitle = tab.title || '';
  if ((!currentTitle || currentTitle === '로딩중...') && tab.webview) {
     const webviewTitle = tab.webview.getTitle();
     if (webviewTitle) {
         updateTitle(tab, webviewTitle);
         currentTitle = webviewTitle; 
     }
  }

  if (currentTitle.includes('나이스') || currentTitle.includes('업무포털') || currentTitle.includes('NEIS')) {
      console.log('Vue: 메인 화면 감지 -> 데이터 수집 시작');
      if(autoFetchMenuData) autoFetchMenuData(true);
      if(tab.webview) tab.webview.focus();
  }
};

const onNavStart = (tab, e) => {
  if (e.isMainFrame && !e.isSameDocument) {
    updateTitle(tab, '로딩중...');
  }
};

const handleNewTabRequest = (...args) => {
  const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
  
  if (foundUrl) {
    createTab(foundUrl, '로딩중...');

    // ★★★ [이동됨] 여기서 전체화면 요청! ★★★
    // 즉, 로그인 후 업무 시스템이 팝업으로 뜰 때 창이 커집니다.
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('req-window-maximize');
    }
  }
};

// ★★★ [수정] 붙여넣기 요청 핸들러 ★★★
const handlePasteRequest = async (payload) => {
  console.log('[Vue] 붙여넣기 요청 수신:', payload);
  const webview = getActiveWebview();
  if (!webview) return;

  const clipboardText = payload.clipboardText;
  if (!clipboardText) {
    console.warn("전달된 텍스트가 없습니다.");
    return;
  }

  // 1. 붙여넣을 데이터 개수 미리 계산
  // (빈 줄은 제외하고 카운트합니다)
  const items = clipboardText
    .split(/[\r\n]+/)                // 줄바꿈으로 자르고
    .filter(t => t.trim().length > 0); // 공백만 있는 줄 제거

  const count = items.length;
  if (count === 0) return;

  const row = payload.startRow;
  
  // 2. 메시지 수정: "n행부터 m개의 자료를..."
  const msg = `[나이스브라우저]\n\n${row}행부터 총 ${count}개의 자료를 붙여넣으시겠습니까?\n(기존 내용은 덮어씌워집니다)`;

  if(confirm(msg)) {
    
    // 원격 스크립트 실행
    const res = await runRemoteScript(webview, 'pasteToGrid', {
      clipboardText: clipboardText,
      startRow: row,
      selectorSuffix: payload.selectorSuffix
    });

    if (!res.success) {
      console.error("Paste Script Error:", res.error);
      alert("붙여넣기 중 오류가 발생했습니다.\n" + (res.error || 'Unknown Error'));
    }
  }
};

onMounted(async () => {
  setupMenuListeners();     
  setupPasswordListeners(); 

  // Preload 경로
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
    } catch (e) { console.error(e); }
  }

  // 탭 생성
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  if (tabs.value.length === 0) createTab(region.url, `${region.name} 업무포털`);

  // 비밀번호 로드
  await loadSavedPassword();

  // 리스너 등록
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('request-new-tab');
    window.electron.ipcRenderer.on('request-new-tab', handleNewTabRequest);

    // ★ 붙여넣기 리스너 등록
    window.electron.ipcRenderer.removeAllListeners('req-paste-grid');
    window.electron.ipcRenderer.on('req-paste-grid', handlePasteRequest);
  }
});

onUnmounted(() => {
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('request-new-tab');
    window.electron.ipcRenderer.removeAllListeners('req-paste-grid');
  }
});
</script>

<style scoped>
.browser-layout { display: flex; flex-direction: column; height: 100vh; background: #f3f3f3; }
.webview-wrapper { flex: 1; background: white; position: relative; box-shadow: 0 -2px 5px rgba(0,0,0,0.02); }
.webview-container { width: 100%; height: 100%; }
.neis-webview { width: 100%; height: 100%; border: none; }
</style>