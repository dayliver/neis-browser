import { contextBridge, ipcRenderer } from 'electron'

// 1. API 정의
const api = {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => {
    const subscription = (_event, ...args) => func(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
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
    console.log(`Preload: 현장 투입 완료 (${window.location.href})`);

    // A. 새 탭 열기 감지
    document.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.menuBtn');
      if (menuBtn) {
        const targetUrl = menuBtn.getAttribute('id');
        if (targetUrl && targetUrl.startsWith('http')) {
          // 팝업 차단 후 탭 요청
          e.preventDefault();
          e.stopImmediatePropagation();
          ipcRenderer.send('bridge-create-tab', targetUrl);
        }
      }
    }, true);

    // B. 비밀번호 입력창 감지 및 타이핑 요청
    setInterval(() => {
      const certInput = document.querySelector('input[name="certPassword"]');
      
      if (certInput) {
        // 시각적 확인 (빨간 테두리)
        if (certInput.style.border !== '5px solid red') {
            certInput.style.border = '5px solid red';
            certInput.style.backgroundColor = 'yellow';
        }

        if (!certInput.dataset.listenerAttached) {
          certInput.addEventListener('click', () => {
            
            // 시각적 확인 (파란색)
            certInput.style.backgroundColor = 'cyan';
            console.log('Preload: 클릭됨 -> 타이핑 요청 전송');
            
            // ★ [핵심] 직접 넣지 않고 Vue에게 타이핑 요청
            ipcRenderer.send('req-type-password'); 
          });
          
          certInput.dataset.listenerAttached = 'true';
        }
      }
    }, 500);
  });
}