<template>
  <div class="browser-layout">
    
    <div class="titlebar">
      
      <div class="tabs-container">
        <div 
          v-for="tab in tabs" 
          :key="tab.id"
          class="tab-item"
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
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

// 1. 리팩토링된 부품들 가져오기
import ActionButton from '../components/ActionButton.vue';
import { useTabs } from '../composables/useTabs';

// 2. 탭 로직 연결 (Composables)
const { 
  tabs, 
  currentTabId, 
  createTab, 
  closeTab, 
  switchTab, 
  updateTitle, 
  getActiveWebview 
} = useTabs();

const router = useRouter();
const preloadPath = ref('');

// 3. 로컬 상태 (비밀번호/모달) - 나중에 usePassword.js 로 분리 가능
const showLoginModal = ref(false);
const loginForm = ref({ id: '', password: '' });

// 4. 초기화 및 IPC 연결
onMounted(async () => {
  // (1) Preload 경로 확보
  if (window.electron?.ipcRenderer) {
    try {
      const rawPath = await window.electron.ipcRenderer.getPreloadPath();
      preloadPath.value = 'file:///' + rawPath.replace(/\\/g, '/');
      console.log('Vue: Preload 경로 ->', preloadPath.value);
    } catch (e) { console.error(e); }
  }

  // (2) 지역/탭 초기화
  const savedData = localStorage.getItem('user_region');
  if (!savedData) { router.push({ name: 'SelectRegion' }); return; }
  const region = JSON.parse(savedData);
  
  if (tabs.value.length === 0) {
    createTab(region.url, `${region.name} 업무포털`);
  }

  // (3) 비밀번호 로드
  const savedLogin = localStorage.getItem('auto_login_info');
  if (savedLogin) {
    const parsed = JSON.parse(savedLogin);
    loginForm.value.id = parsed.id;
    if (parsed.encryptedPassword && window.electron?.ipcRenderer) {
      try {
        loginForm.value.password = await window.electron.ipcRenderer.decryptPassword(parsed.encryptedPassword);
        console.log('Vue: 비밀번호 로드 완료');
      } catch (e) { console.error(e); }
    }
  }

  // (4) IPC 리스너 등록
  if (window.electron?.ipcRenderer) {
    // 탭 생성 요청 (Preload -> Main -> Vue)
    window.electron.ipcRenderer.on('request-new-tab', (...args) => {
      const foundUrl = args.find(arg => typeof arg === 'string' && arg.startsWith('http'));
      if (foundUrl) createTab(foundUrl, '로딩중...');
    });

    // 비밀번호 요청 (Preload -> Main -> Vue)
    window.electron.ipcRenderer.on('bridge-req-pass-to-vue', () => {
      console.log('[통신] 비밀번호 요청 수신');
      const webview = getActiveWebview(); // Composable 함수 사용
      if (loginForm.value.password && webview) {
        const cleanPass = loginForm.value.password.trim();
        webview.send('res-send-password', cleanPass);
      }
    });

    // ★★★ [수정] 타이핑 요청 수신 -> 하드웨어 입력 실행 ★★★
    window.electron.ipcRenderer.on('req-type-password-to-vue', async () => {
      console.log('[통신] 타이핑 요청 도착! 입력 시작합니다.');

      const webview = getActiveWebview(); // Composable 사용

      if (loginForm.value.password && webview) {
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
        // alert('비밀번호를 먼저 설정해주세요(🔑)');
      }
    });
  }
});

// 5. 버튼 동작 함수들
const refreshTab = () => {
  const webview = getActiveWebview();
  if (webview) webview.reload();
};

const openDevTools = () => {
  const webview = getActiveWebview();
  if (webview) webview.openDevTools();
};

const executeAutoLogin = () => {
  const webview = getActiveWebview();
  if (webview && loginForm.value.password) {
    webview.send('res-send-password', loginForm.value.password);
  } else {
    alert('비밀번호가 없거나 탭이 없습니다.');
  }
};

const goRegionSelect = () => {
  if(confirm('모든 탭이 닫힙니다. 지역을 변경하시겠습니까?')) {
    localStorage.removeItem('user_region');
    router.push({ name: 'SelectRegion' });
  }
};

// 6. [기능구현 예정] 엑셀 붙여넣기 (HTML 파서 포함 버전)
const runExcelPaste = async () => {
  const webview = getActiveWebview();
  if (!webview) return alert('활성화된 탭이 없습니다.');

  try {
    const clipboardItems = await navigator.clipboard.read();
    let dataList = [];
    let isHtml = false;

    // HTML 우선 파싱 (따옴표/줄바꿈 완벽 호환)
    for (const item of clipboardItems) {
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html');
        const htmlText = await blob.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const rows = doc.querySelectorAll('tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach(cell => {
            // 특수문자(스마트 따옴표) 교정
            let text = cell.innerText
              .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\u00A0/g, ' ').trim();
            if (text) dataList.push(text);
          });
        });
        isHtml = true;
        break;
      }
    }

    // 텍스트 폴백
    if (!isHtml) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        dataList = text.split(/\r?\n/).filter(l => l.trim());
      }
    }

    if (dataList.length === 0) return alert('데이터가 없습니다.');

    if (confirm(`[데이터 준비]\n${dataList.length}건의 데이터를 찾았습니다.\n전송하시겠습니까?`)) {
      console.log(`[Vue] 엑셀 데이터 전송 (${dataList.length}건)`);
      webview.send('cmd-excel-data', dataList);
    }

  } catch (err) {
    // navigator.clipboard.read()가 막혔을 때 readText()로 재시도
    try {
      const text = await navigator.clipboard.readText();
      if(text) {
         const list = text.split(/\r?\n/).filter(l => l.trim());
         if(confirm(`(텍스트 모드) ${list.length}건 전송할까요?`)) {
            webview.send('cmd-excel-data', list);
         }
      }
    } catch(e) {
      alert('클립보드 오류: ' + err.message);
    }
  }
};

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
</script>

<style scoped>
/* 레이아웃 관련 스타일은 컴포넌트 구조를 위해 여기에 남겨둡니다 */
.browser-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f3f3f3;
}

.titlebar {
  height: 45px;
  display: flex;
  align-items: flex-end;
  background: #f3f3f3;
  padding-left: 10px;
  -webkit-app-region: drag;
  user-select: none;
}

/* 탭 컨테이너 */
.tabs-container {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-container::-webkit-scrollbar { display: none; }

/* 탭 아이템 (useTabs 로직과 연동되는 클래스) */
.tab-item {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  width: 180px;
  height: 36px;
  background: #e0e0e0;
  border-radius: 8px 8px 0 0;
  padding: 0 10px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.tab-item:hover { background: #ebebeb; }
.tab-item.active {
  background: #ffffff;
  color: #000;
  font-weight: 600;
  box-shadow: 0 0 10px rgba(0,0,0,0.05);
  z-index: 1;
}
.tab-item.active::after {
  content: ''; position: absolute; bottom: -5px; left: 0; right: 0; height: 5px; background: white;
}
.tab-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close-btn { margin-left: 8px; font-size: 14px; border-radius: 50%; padding: 0 4px; }
.close-btn:hover { background: #ff7675; color: white; }

/* 버튼 영역 */
.action-buttons {
  display: flex;
  align-items: center;
  margin-left: 10px;
  padding-bottom: 6px;
  -webkit-app-region: no-drag;
}

.window-controls-spacer { width: 140px; flex-shrink: 0; }

/* 웹뷰 영역 */
.webview-wrapper {
  flex: 1;
  background: white;
  position: relative;
  box-shadow: 0 -2px 5px rgba(0,0,0,0.02);
}
.webview-container { width: 100%; height: 100%; }
.neis-webview { width: 100%; height: 100%; border: none; }

/* 모달 스타일 (추후 분리 가능) */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; justify-content: center; align-items: center;
  z-index: 99999;
}
.modal-content {
  background: white; padding: 25px; border-radius: 12px; width: 320px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.3);
}
.warning { font-size: 12px; color: #e74c3c; margin-bottom: 15px; }
.input-group { margin-bottom: 15px; }
.input-group label { display: block; font-size: 12px; margin-bottom: 5px; color: #555; }
.input-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.save-btn { background: #42b983; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
</style>