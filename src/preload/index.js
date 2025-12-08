import { contextBridge, ipcRenderer } from 'electron'

const api = {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => {
    // _event를 제외하고 인자만 전달 (Vue에서 payload로 바로 받음)
    const subscription = (_event, ...args) => func(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  encryptPassword: (text) => ipcRenderer.invoke('encrypt-password', text),
  decryptPassword: (hex) => ipcRenderer.invoke('decrypt-password', hex),
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),
  getSystemLog: (size) => ipcRenderer.invoke('get-system-log', size),
  deleteSystemLog: () => ipcRenderer.invoke('delete-system-log')
}

if (process.contextIsolated) {
  try { contextBridge.exposeInMainWorld('electron', { ipcRenderer: api }) } catch (e) {}
} else { window.electron = { ipcRenderer: api } }

// 헬퍼: 행 번호 추출
function getRowNumber(el) {
  if (!el) return null;
  const aria = el.getAttribute('aria-label') ?? '';
  const m = aria.match(/^(\d+)행/);
  return m ? Number(m[1]) : null;
}

// 헬퍼: 셀 구분자 추출
function getSelectorSuffix(el) {
  if (!el) return null;
  const aria = el.getAttribute('aria-label') ?? '';
  const m = aria.match(/^\d+행\s*(특기사항|행동특성 및 종합의견|희망분야)/);
  return m ? m[1] : null;
}

if (!window.location.href.includes('localhost') && !window.location.href.includes('127.0.0.1')) {

  window.addEventListener('DOMContentLoaded', () => {
    console.log(`Preload: 로드 완료`);
    setupBasicFeatures();

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NEIS_MENU_FOUND') {
        ipcRenderer.send('bridge-menu-data', event.data.payload);
      }
    });
  });

  function setupBasicFeatures() {
    // 1. 붙여넣기 감지 -> Vue로 위임
    window.addEventListener('paste', (e) => {
      const activeElement = document.activeElement;
      
      // 입력창이 아니면 무시
      if (!activeElement || (activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'INPUT')) {
        return;
      }

      const rowNumber = getRowNumber(activeElement);
      const selectorSuffix = getSelectorSuffix(activeElement);

      // NEIS 그리드(행 번호가 있는 곳)가 아니면 무시 (일반 붙여넣기 허용)
      if (!rowNumber) return;

      // NEIS 그리드라면 기본 동작 차단
      e.preventDefault();
      e.stopImmediatePropagation();

      // ★ [핵심] 클립보드 텍스트를 여기서 바로 추출 (보안 에러 방지)
      const clipboardText = (e.clipboardData || window.clipboardData).getData('text');

      // Vue에게 데이터와 함께 요청 전송
      ipcRenderer.send('req-paste-grid', {
        startRow: rowNumber,
        selectorSuffix: selectorSuffix,
        clipboardText: clipboardText
      });
      
    }, true); 

    // 2. 단축키 감지
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
        e.preventDefault(); e.stopPropagation();
        ipcRenderer.send('req-toggle-search');
      }
    }, true);

    // 3. 새 탭 열기
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

    // 4. 인증서 암호 입력 감지
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