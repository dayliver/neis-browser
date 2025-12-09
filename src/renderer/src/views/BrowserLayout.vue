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

    <LogViewerModal 
      v-if="showLogModal"
      @close="showLogModal = false"
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
import LogViewerModal from '../components/LogViewerModal.vue';

// 로직(Composables) 임포트
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';
import { useMenuSearch } from '../composables/useMenuSearch';
import { useScriptExecutor } from '../composables/useScriptExecutor';
import { useLogViewer } from '../composables/useLogViewer';

// ★ [신규] useModal 임포트
import { useModal } from '../composables/useModal';

const router = useRouter();
const preloadPath = ref('');
const { showLogModal } = useLogViewer();

// ★ [신규] focusActiveWebview 함수 가져오기
const { tabs, currentTabId, createTab, updateTitle, getActiveWebview, focusActiveWebview } = useTabs();
const { showLoginModal, loginForm, loadSavedPassword, saveLoginInfo, setupPasswordListeners } = usePassword(getActiveWebview);
const { menuData, isSearchOpen, setupMenuListeners, executeMenu, autoFetchMenuData } = useMenuSearch();
const { runRemoteScript } = useScriptExecutor(); 

// ★ [신규] 모달 사용 준비
const modal = useModal();

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
      
      // 로딩 완료 후에도 포커스를 확실히 잡기 위해 실행
      if(tab.webview) focusActiveWebview();
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
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('req-window-maximize');
    }
  }
};

// ★★★ [핵심 수정] 붙여넣기 요청 핸들러 ★★★
const handlePasteRequest = async (payload) => {
  console.log('[Vue] 붙여넣기 요청 수신:', payload);
  const webview = getActiveWebview();
  if (!webview) return;

  const clipboardText = payload.clipboardText;
  if (!clipboardText) {
    console.warn("전달된 텍스트가 없습니다.");
    return;
  }

  const items = clipboardText.split(/[\r\n]+/).filter(t => t.trim().length > 0);
  const count = items.length;
  if (count === 0) return;

  const row = payload.startRow;
  const msg = `${row}행부터 총 ${count}개의 자료를 붙여넣으시겠습니까?\n(기존 내용은 덮어씌워집니다)`;

  // [수정] 네이티브 confirm 대신 커스텀 모달 사용 (await)
  const isConfirmed = await modal.confirm('붙여넣기 확인', msg);

  if(isConfirmed) {
    // 원격 스크립트 실행
    const res = await runRemoteScript(webview, 'pasteToGrid', {
      clipboardText: clipboardText,
      startRow: row,
      selectorSuffix: payload.selectorSuffix
    });

    if (res.success && res.result && res.result.success) {
      const { pasted, remaining } = res.result.report;
      
      let resultMsg = `✅ 작업 완료!\n- 성공: ${pasted}건`;
      if (remaining > 0) resultMsg += `\n- 생략: ${remaining}건 (입력칸 부족)`;
      
      // [수정] 네이티브 alert 대신 커스텀 모달 사용
      await modal.alert('완료', resultMsg);

      // ★ [Plan C 적용] 모달이 닫힌 직후 "강제 클릭 시뮬레이션"으로 포커스 복구
      focusActiveWebview();

    } else {
      console.error("Paste Script Error:", res.error || res.result?.error);
      await modal.alert('오류 발생', "붙여넣기 중 오류가 발생했습니다.\n" + (res.error || res.result?.error || 'Unknown Error'), '닫기');
      focusActiveWebview();
    }
  } else {
    // 취소했을 때도 원래 작업하던 곳으로 포커스 돌려주기
    focusActiveWebview();
  }
};

onMounted(async () => {
  setupMenuListeners();     
  setupPasswordListeners(); 

  // Preload 경로 설정
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
    } catch (e) { console.error(e); }
  }

  // 초기 탭 생성
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  if (tabs.value.length === 0) createTab(region.url, `${region.name} 업무포털`);

  await loadSavedPassword();

  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('request-new-tab');
    window.electron.ipcRenderer.on('request-new-tab', handleNewTabRequest);

    // 붙여넣기 리스너
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