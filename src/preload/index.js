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

  window.addEventListener('DOMContentLoaded', () => {
    console.log(`Preload: 로드 완료`);
    setupBasicFeatures();

    // [수신] 스파이 데이터
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
          }
        } catch (e) { console.error(e); }
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  });

  // [명령] 메뉴 실행
  ipcRenderer.on('req-execute-menu', (event, menuId, param) => {
    const paramStr = param ? JSON.stringify(param) : "null";
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          var mainDef = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index");
          var main = mainDef.getInstances()[0];
          if (main) {
             main.callAppMethod("doOpenMenuToMdi", "${menuId}", ${paramStr});
          }
        } catch (e) { console.error(e); }
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  });

  // =========================================================
  // 기본 기능 설정
  // =========================================================
  function setupBasicFeatures() {
    
    // 1. ★★★ [수정] 붙여넣기 감지 (Textarea & Table 확인) ★★★
    window.addEventListener('keydown', async (e) => {
      // Ctrl+V 감지
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        
        // (1) 타겟 확인: Textarea 인가?
        const target = document.activeElement;
        const isTextarea = target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && target.type === 'text'));
        
        // Textarea가 아니면 -> 그냥 둠 (일반 붙여넣기)
        if (!isTextarea) return;

        // --------------------------------------------------
        // Textarea라면 -> 클립보드 검사 시작
        // --------------------------------------------------
        
        try {
          const clipboardItems = await navigator.clipboard.read();
          let isTableData = false;

          for (const item of clipboardItems) {
            if (item.types.includes('text/html')) {
              const blob = await item.getType('text/html');
              const htmlText = await blob.text();
              // 테이블 태그 확인
              if (htmlText.includes('<table') || htmlText.includes('<tr')) {
                isTableData = true;
                break;
              }
            }
          }

          // (2) 표 데이터면 -> 일괄 붙여넣기 제안
          if (isTableData) {
             e.preventDefault(); // 기본 붙여넣기 차단
             e.stopImmediatePropagation();

             if (confirm('표(Table) 데이터가 감지되었습니다.\n일괄 붙여넣기를 진행하시겠습니까?')) {
                 console.log('>> 일괄 붙여넣기 시작');
                 // TODO: Vue에게 runBatchPaste 요청 보내기
                 // ipcRenderer.send('req-batch-paste-start');
                 alert('일괄 붙여넣기 로직을 실행합니다.');
             } else {
                 // 취소하면 -> 텍스트로 변환해서 일반 붙여넣기
                 const text = await navigator.clipboard.readText();
                 document.execCommand('insertText', false, text);
             }
          }
          // 표가 아니면 -> 아무것도 안 함 (브라우저가 알아서 붙여넣음)

        } catch (err) {
          // 클립보드 읽기 에러 시 -> 그냥 둠
          console.error(err);
        }
      }
    }, true); // Capturing


    // 2. 단축키 (F3)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
        e.preventDefault(); e.stopPropagation();
        ipcRenderer.send('req-toggle-search');
      }
    }, true);

    // 3. 탭 열기
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

    // 4. 비밀번호 입력
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