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
        <button class="icon-btn" @click="runExcelPaste" title="엑셀 붙여넣기">📋</button>
        <button class="icon-btn" @click="refreshTab" title="새로고침">🔄</button>
        <button class="icon-btn" @click="openWebviewDevTools" title="디버그">🐞</button>
        <button class="icon-btn" @click="showLoginModal = true" title="비밀번호 설정">🔑</button>
        <button class="icon-btn danger" @click="goRegionSelect" title="지역변경">🚪</button>
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

    <div v-if="showLoginModal" class="modal-overlay" @click.self="showLoginModal = false">
      <div class="modal-content">
        <h3>🔑 인증서 암호 설정</h3>
        <p class="warning">저장해두면 클릭 시 자동 입력됩니다.</p>
        <div class="input-group">
          <label>비밀번호</label>
          <input v-model="loginForm.password" type="password" placeholder="입력" @keyup.enter="saveLoginInfo" />
        </div>
        <div class="modal-actions">
          <button @click="saveLoginInfo" class="save-btn">저장</button>
          <button @click="showLoginModal = false">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const tabs = ref([]);
const currentTabId = ref(null);
const currentTab = computed(() => tabs.value.find(t => t.id === currentTabId.value));
const preloadPath = ref('');
const showLoginModal = ref(false);
const loginForm = ref({ id: '', password: '' });

onMounted(async () => {
  // 1. Preload 경로 (file:/// 필수)
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
      console.log('Vue: Preload 경로 ->', preloadPath.value);
    } catch (e) { console.error(e); }
  }

  // 2. 지역 및 탭
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  if (tabs.value.length === 0) createTab(region.url, `${region.name} 업무포털`);

  // 3. 비밀번호 로드
  const savedLogin = localStorage.getItem('auto_login_info');
  if (savedLogin) {
    const parsed = JSON.parse(savedLogin);
    loginForm.value.id = parsed.id;
    if (parsed.encryptedPassword && window.electron?.ipcRenderer) {
      try {
        loginForm.value.password = await window.electron.ipcRenderer.decryptPassword(parsed.encryptedPassword);
      } catch (e) { console.error(e); }
    }
  }

  // 4. IPC 리스너 (이 부분만 수정하세요)
  if (window.electron?.ipcRenderer) {
    // (탭 생성 리스너 유지)
    window.electron.ipcRenderer.on('request-new-tab', (...args) => {
      const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
      if (foundUrl) createTab(foundUrl, '로딩중...');
    });

    // ★ [수정] 타이핑 요청 수신 -> 하드웨어 입력 실행
    window.electron.ipcRenderer.on('req-type-password-to-vue', async () => {
      console.log('[통신] 타이핑 요청 도착! 입력 시작합니다.');

      if (loginForm.value.password && currentTab.value?.webview) {
        const webview = currentTab.value.webview;
        const password = loginForm.value.password;

        // 1. 웹뷰에 포커스 (중요)
        webview.focus();

        // 2. 한 글자씩 또박또박 입력 (보안 우회)
        for (let i = 0; i < password.length; i++) {
          const char = password.charAt(i);
          webview.sendInputEvent({ type: 'char', keyCode: char });
          // 0.05초 간격
          await new Promise(r => setTimeout(r, 50));
        }
        console.log('[완료] 타이핑 끝');
      } else {
        console.warn('[에러] 비밀번호가 없거나 웹뷰가 없습니다.');
        alert('비밀번호를 먼저 설정해주세요(🔑)');
      }
    });
  }
});

/* 탭/UI 함수들 */
const createTab = (url, title = '새 탭') => {
  const newId = Date.now() + Math.random();
  tabs.value.push({ id: newId, src: url, url: url, title: title, webview: null });
  currentTabId.value = newId;
};
const closeTab = (id) => {
  const idx = tabs.value.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs.value.splice(idx, 1);
  if (currentTabId.value === id) {
    if (tabs.value.length > 0) currentTabId.value = tabs.value[tabs.value.length - 1].id;
    else router.push({ name: 'SelectRegion' });
  }
};
const switchTab = (id) => currentTabId.value = id;
const updateTitle = (tab, title) => tab.title = title;
const refreshTab = () => { if (currentTab.value?.webview) currentTab.value.webview.reload(); };
const openWebviewDevTools = () => { if (currentTab.value?.webview) currentTab.value.webview.openDevTools(); };
const saveLoginInfo = async () => {
  if (!window.electron?.ipcRenderer) return;
  try {
    const encryptedPw = await window.electron.ipcRenderer.encryptPassword(loginForm.value.password);
    localStorage.setItem('auto_login_info', JSON.stringify({
      id: loginForm.value.id,
      encryptedPassword: encryptedPw
    }));
    showLoginModal.value = false;
    alert('저장되었습니다.');
  } catch (err) { alert(err.message); }
};
const runExcelPaste = () => alert('다음 단계: 엑셀 기능 구현');
const goRegionSelect = () => {
  if(confirm('지역을 변경하시겠습니까?')) {
    localStorage.removeItem('user_region');
    router.push({ name: 'SelectRegion' });
  }
};
</script>

<style scoped>
/* CSS는 기존 그대로 */
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
.icon-btn { background: transparent; border: none; padding: 6px; margin-right: 4px; cursor: pointer; font-size: 16px; border-radius: 4px; }
.icon-btn:hover { background: #e0e0e0; }
.icon-btn.primary { color: #f1c40f; }
.icon-btn.danger { color: #e74c3c; }
.window-controls-spacer { width: 140px; flex-shrink: 0; }
.webview-wrapper { flex: 1; background: white; position: relative; box-shadow: 0 -2px 5px rgba(0,0,0,0.02); }
.webview-container { width: 100%; height: 100%; }
.neis-webview { width: 100%; height: 100%; border: none; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; justify-content: center; align-items: center; z-index: 99999; }
.modal-content { background: white; padding: 25px; border-radius: 12px; width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
.warning { font-size: 12px; color: #e74c3c; margin-bottom: 15px; }
.input-group { margin-bottom: 15px; }
.input-group label { display: block; font-size: 12px; margin-bottom: 5px; color: #555; }
.input-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.save-btn { background: #42b983; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
</style>