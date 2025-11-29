import { contextBridge, ipcRenderer } from 'electron'

// 1. API 정의
const api = {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => {
    const subscription = (_event, ...args) => func(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  encryptPassword: (text) => ipcRenderer.invoke('encrypt-password', text),
  decryptPassword: (hex) => ipcRenderer.invoke('decrypt-password', hex),
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path')
}

// 2. API 노출
if (process.contextIsolated) {
  try { contextBridge.exposeInMainWorld('electron', { ipcRenderer: api }) } catch (e) {}
} else { window.electron = { ipcRenderer: api } }

// 3. NEIS 현장 로직
if (!window.location.href.includes('localhost') && !window.location.href.includes('127.0.0.1')) {

  // ★★★ [복구] 로드 즉시 실행 (기다리지 않음) ★★★
  // 보안 프로그램이 로드되기 전에 우리가 먼저 이벤트를 걸어야 합니다.
  setupBasicFeatures();

  window.addEventListener('DOMContentLoaded', () => {
    console.log(`Preload: 로드 완료`);

    // [수신] 스파이 데이터 받기
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NEIS_MENU_FOUND') {
        const rawData = event.data.payload;
        console.log(`Preload: ${rawData.length}건 확보. Vue로 전송합니다.`);
        ipcRenderer.send('bridge-menu-data', rawData);
      }
    });
  });

  // [명령] 메뉴 추출
  ipcRenderer.on('req-extract-menu', () => {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          if (typeof cpr === 'undefined') return;
          var mainAppDef = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index");
          if (!mainAppDef) return;
          var mainApp = mainAppDef.getInstances()[0];
          var ds = mainApp.lookup("dsAllMenu");
          var dataList = ds.getRowDataRanged();
          if (dataList && dataList.length > 0) {
             window.postMessage({ type: 'NEIS_MENU_FOUND', payload: dataList }, '*');
          } else {
             alert("메뉴 데이터 0건 (로딩 확인 필요)");
          }
        } catch (e) { console.error(e); }
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  });

  // =========================================================
  // ★ [복구] 기본 기능 (단축키 포함)
  // =========================================================
  function setupBasicFeatures() {
    
    // 1. ★★★ [핵심] 단축키 강제 탈취 (Capturing Mode) ★★★
    // useCapture: true 옵션으로 보안 프로그램보다 먼저 키 입력을 가로챕니다.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
        console.log('Preload: 내부 단축키 감지 -> Vue 토글 요청');
        
        // 보안 프로그램이나 브라우저가 처리하지 못하게 막습니다.
        e.preventDefault(); 
        e.stopPropagation();
        
        ipcRenderer.send('req-toggle-search'); // Main으로 신호 발사
      }
    }, true); // <--- true 필수

    // 2. 탭 열기
    document.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.menuBtn');
      if (menuBtn) {
        const url = menuBtn.getAttribute('id');
        if (url && url.startsWith('http')) {
          e.preventDefault(); e.stopImmediatePropagation();
          ipcRenderer.send('bridge-create-tab', url);
        }
      }
    }, true);

    // 3. 비밀번호 입력
    setInterval(() => {
      const certInput = document.querySelector('input[name="certPassword"]');
      if (certInput && !certInput.dataset.listenerAttached) {
        certInput.addEventListener('click', () => {
          certInput.style.backgroundColor = 'cyan';
          ipcRenderer.send('req-type-password');
        });
        certInput.dataset.listenerAttached = 'true';
      }
    }, 500);
  }
}