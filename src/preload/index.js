import { contextBridge, ipcRenderer } from 'electron'

// 공통 API
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

// API 노출
if (process.contextIsolated) {
  try { contextBridge.exposeInMainWorld('electron', { ipcRenderer: api }) } catch (e) {}
} else { window.electron = { ipcRenderer: api } }

// ★ NEIS 현장 로직
if (!window.location.href.includes('localhost') && !window.location.href.includes('127.0.0.1')) {
  
  window.addEventListener('DOMContentLoaded', () => {
    console.log(`Preload: 현장 투입 완료 (${window.location.href})`);

    // 1. 새 탭 열기 감지 (이중 실행 방지 적용)
    document.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.menuBtn');
      if (menuBtn) {
        const targetUrl = menuBtn.getAttribute('id');
        if (targetUrl && targetUrl.startsWith('http')) {
          console.log('Preload: 메뉴 버튼 클릭됨 -> 탭 생성 요청');
          
          // ★★★ [핵심 수정] 원래 사이트의 팝업 스크립트 차단 ★★★
          e.preventDefault();
          e.stopImmediatePropagation();
          
          ipcRenderer.send('bridge-create-tab', targetUrl);
        }
      }
    }, true); // 캡처링 단계에서 먼저 가로챔

    // 2. 비밀번호 입력창 감지
    setInterval(() => {
      const certInput = document.querySelector('input[name="certPassword"]');
      
      if (certInput) {
        // 시각적 확인 (발견 시 빨간 테두리)
        if (certInput.style.border !== '5px solid red') {
            certInput.style.border = '5px solid red';
        }

        if (!certInput.dataset.listenerAttached) {
          certInput.addEventListener('click', () => {
            // 시각적 확인 (클릭 시 파란 배경)
            certInput.style.backgroundColor = 'cyan';
            
            console.log('Preload: 클릭됨 -> Vue에게 타이핑 요청');
            
            // ★ [수정] 직접 넣지 않고, Vue에게 "쳐줘!" 라고 요청
            // (채널명을 req-type-password로 변경)
            ipcRenderer.send('req-type-password'); 
          });
          
          certInput.dataset.listenerAttached = 'true';
        }
      }
    }, 500);
  });
}