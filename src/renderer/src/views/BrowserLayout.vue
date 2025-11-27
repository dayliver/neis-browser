<template>
  <div class="browser-layout">
    
    <div class="titlebar">
      <div class="tabs-container">
        <div 
          v-for="tab in tabs" :key="tab.id" class="tab-item"
          :class="{ active: currentTabId === tab.id }"
          @click="switchTab(tab.id)"
        >
          <span class="tab-icon">📄</span>
          <span class="tab-title">{{ tab.title }}</span>
          <span class="close-btn" @click.stop="closeTab(tab.id)">×</span>
        </div>
      </div>

      <div class="action-buttons">
        <ActionButton emoji="📋" label="엑셀 붙여넣기" @click="runExcelPaste" />
        <ActionButton emoji="🔄" label="새로고침" @click="refreshTab" />
        <ActionButton emoji="🐞" label="디버그" @click="openDevTools" />
        <ActionButton emoji="🔑" label="비밀번호 설정" @click="showLoginModal = true" />
        <ActionButton emoji="⚡" label="수동 입력" variant="primary" @click="executeAutoLogin" />
        <ActionButton emoji="🚪" label="지역변경" variant="danger" @click="goRegionSelect" />
      </div>
      <div class="window-controls-spacer"></div>
    </div>

    <div class="webview-wrapper">
      <div 
        v-if="preloadPath" 
        v-for="tab in tabs" :key="tab.id" class="webview-container"
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

// 컴포넌트 & 로직 임포트
import ActionButton from '../components/ActionButton.vue';
import LoginModal from '../components/LoginModal.vue';
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';

const router = useRouter();
const preloadPath = ref('');

// 1. 탭 로직 (Composable)
const { 
  tabs, currentTabId, createTab, closeTab, switchTab, updateTitle, getActiveWebview 
} = useTabs();

// 2. 비밀번호 로직 (Composable) - getActiveWebview를 주입해줘야 함
const { 
  showLoginModal, loginForm, loadSavedPassword, saveLoginInfo, setupPasswordListeners, executeAutoLogin 
} = usePassword(getActiveWebview);

// 3. 초기화 및 이벤트 연결
onMounted(async () => {
  // (1) Preload 경로 로드
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
    } catch (e) { console.error(e); }
  }

  // (2) 지역/탭 생성
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  if (tabs.value.length === 0) createTab(region.url, `${region.name} 업무포털`);

  // (3) 로직 초기화
  await loadSavedPassword(); // 비밀번호 로드
  setupPasswordListeners();  // IPC 리스너 등록 (타이핑)

  // (4) 탭 생성 리스너 (이건 Layout에 남겨두거나 useTabs로 이동 가능, 여기 둠)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('request-new-tab', (...args) => {
      const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
      if (foundUrl) createTab(foundUrl, '로딩중...');
    });
  }
});

// 4. 단순 UI 액션들
const refreshTab = () => getActiveWebview()?.reload();
const openDevTools = () => getActiveWebview()?.openDevTools();
const runExcelPaste = () => alert('다음 단계에서 분리 예정'); // 아직 구현 전

const goRegionSelect = () => {
  if(confirm('지역을 변경하시겠습니까?')) {
    localStorage.removeItem('user_region');
    router.push({ name: 'SelectRegion' });
  }
};
</script>

<style scoped>
/* 레이아웃 스타일 */
.browser-layout { display: flex; flex-direction: column; height: 100vh; background: #f3f3f3; }
.titlebar { height: 45px; display: flex; align-items: flex-end; background: #f3f3f3; padding-left: 10px; -webkit-app-region: drag; user-select: none; }
.tabs-container { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.tabs-container::-webkit-scrollbar { display: none; }
.tab-item { -webkit-app-region: no-drag; display: flex; align-items: center; width: 180px; height: 36px; background: #e0e0e0; border-radius: 8px 8px 0 0; padding: 0 10px; font-size: 13px; color: #555; cursor: pointer; transition: background 0.2s; position: relative; }
.tab-item:hover { background: #ebebeb; }
.tab-item.active { background: #ffffff; color: #000; font-weight: 600; box-shadow: 0 0 10px rgba(0,0,0,0.05); z-index: 1; }
.tab-item.active::after { content: ''; position: absolute; bottom: -5px; left: 0; right: 0; height: 5px; background: white; }
.tab-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close-btn { margin-left: 8px; font-size: 14px; border-radius: 50%; padding: 0 4px; }
.close-btn:hover { background: #ff7675; color: white; }
.action-buttons { display: flex; align-items: center; margin-left: 10px; padding-bottom: 6px; -webkit-app-region: no-drag; }
.window-controls-spacer { width: 140px; flex-shrink: 0; }
.webview-wrapper { flex: 1; background: white; position: relative; box-shadow: 0 -2px 5px rgba(0,0,0,0.02); }
.webview-container { width: 100%; height: 100%; }
.neis-webview { width: 100%; height: 100%; border: none; }
</style>