import { contextBridge, ipcRenderer, webFrame } from 'electron'

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

if (process.contextIsolated) {
  try { contextBridge.exposeInMainWorld('electron', { ipcRenderer: api }) } catch (e) {}
} else { window.electron = { ipcRenderer: api } }

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
  // ★★★ [신규] 스마트 입력 차단 (Trusted Event Filtering) ★★★
  // =========================================================
  
  const InputGuard = {
    overlay: null,
    
    // 핵심 로직: 사용자가 발생시킨 이벤트(isTrusted: true)만 차단
    // 스크립트가 발생시킨 이벤트(isTrusted: false)는 통과
    handler: (e) => {
      if (e.isTrusted) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    },

    lock: () => {
      // 1. 시각적 알림 (클릭을 막지는 않음, pointer-events: none)
      if (!document.getElementById('neis-guard-overlay')) {
        const div = document.createElement('div');
        div.id = 'neis-guard-overlay';
        div.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 999999; 
          background: rgba(0, 0, 0, 0.05); 
          display: flex; align-items: flex-end; justify-content: center;
          padding-bottom: 50px;
          pointer-events: none; /* 중요: 스크립트 클릭이 통과되도록 함 */
        `;
        
        const msg = document.createElement('div');
        msg.style.cssText = `
          background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
          border-radius: 30px; font-weight: bold; font-size: 14px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        `;
        msg.innerText = "⚡ 일괄 입력 중입니다... 마우스와 키보드를 건드리지 마세요.";
        
        div.appendChild(msg);
        document.body.appendChild(div);
        InputGuard.overlay = div;
      }

      // 2. 이벤트 캡처링으로 사용자 입력 차단
      const events = ['mousedown', 'mouseup', 'click', 'keydown', 'keypress', 'keyup', 'wheel', 'contextmenu'];
      events.forEach(evt => {
        window.addEventListener(evt, InputGuard.handler, true); // capture: true
      });
    },

    unlock: () => {
      // 1. 오버레이 제거
      const div = document.getElementById('neis-guard-overlay');
      if (div) div.remove();

      // 2. 리스너 해제
      const events = ['mousedown', 'mouseup', 'click', 'keydown', 'keypress', 'keyup', 'wheel', 'contextmenu'];
      events.forEach(evt => {
        window.removeEventListener(evt, InputGuard.handler, true);
      });
    }
  };

  const simulateClick = (element, ms = 200) => new Promise(resolve => {
    if (!element) {
        setTimeout(resolve, ms);
        return;
    }
    // 스크립트 생성 이벤트는 isTrusted가 false임
    const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
    const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

    element.dispatchEvent(mouseOverEvent);
    element.dispatchEvent(mouseDownEvent);
    element.dispatchEvent(mouseUpEvent);
    element.dispatchEvent(clickEvent);
    
    setTimeout(resolve, ms);
  });

  function normalizeToKeyboardChars(text) {
    if (!text) return '';
    return text
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00A0/g, ' ')
      .replace(/\u3000/g, ' ')
      .normalize('NFKC');
  }

  function getRowNumber(el) {
    if (!el) return null;
    const aria = el.getAttribute('aria-label') ?? '';
    const m = aria.match(/^(\d+)행/);
    return m ? Number(m[1]) : null;
  }

  function getArrayFromEvent(e) {
    const clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard) return [];

    const html = clipboard.getData('text/html') || '';
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const table = doc.querySelector('table');

      if (table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        const arr = rows
          .map(row => normalizeToKeyboardChars(row.textContent.trim()))
          .filter(text => text.length > 0);

        if (arr.length > 0) return arr;
      }
    }

    const plain = clipboard.getData('text/plain') || '';
    if (!plain) return [];

    return [normalizeToKeyboardChars(plain)];
  }

  // ★★★ [수정] pasteArray 함수 ★★★
  async function pasteArray(array, startRow, selectorSuffix) {
    
    // [잠금] 사용자 입력만 차단
    InputGuard.lock();

    try {
      for (let i = 0; i < array.length; i++) {
        // 비상 탈출: 사용자가 페이지를 이동했거나 DOM이 사라진 경우
        if (!document.getElementById('neis-guard-overlay')) {
             InputGuard.lock(); // 다시 잠금
        }

        const row = startRow + i;
        const text = array[i];
        
        // 셀 찾기
        const selector = `div[aria-label^="${row}행"][aria-label*="${selectorSuffix}"]`;
        const element = document.querySelector(selector);
        
        if (!element) {
            console.warn(`[스킵] ${row}행 요소를 찾을 수 없음`);
            continue;
        }

        // 클릭 시뮬레이션 (InputGuard는 isTrusted=false인 이 이벤트를 통과시킴)
        await simulateClick(element, 150); // NEIS 반응 속도 고려

        let activeInput = document.activeElement;

        // 포커스 확인 및 재시도
        if (!activeInput || (activeInput.tagName !== 'TEXTAREA' && activeInput.tagName !== 'INPUT')) {
            await new Promise(r => setTimeout(r, 100));
            activeInput = document.activeElement;
        }

        if (activeInput && (activeInput.tagName === 'TEXTAREA' || activeInput.tagName === 'INPUT')) {
          activeInput.focus();
          
          // [수정] 기존 값이 있다면 전체 선택하여 덮어쓰기 모드로 진입
          activeInput.select();
          
          // execCommand 사용 (가장 안정적)
          const success = document.execCommand('insertText', false, text);
          
          // 실패 시 fallback
          if (!success) {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
              nativeInputValueSetter.call(activeInput, text);
              activeInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

          // 엔터키 입력 (저장 트리거)
          await new Promise(r => setTimeout(r, 50)); 
          activeInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
          
        } else {
          console.error(`[실패] ${row}행 - 입력창 활성화 실패`);
        }
        
        // 다음 입력 전 딜레이
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {
      console.error("일괄 입력 중 오류:", e);
      alert("오류가 발생하여 입력이 중단되었습니다.");
    } finally {
      // [해제]
      InputGuard.unlock();
    }
  }

  function getSelectorSuffix(el) {
    if (!el) return null;
    const aria = el.getAttribute('aria-label') ?? '';
    const m = aria.match(/^\d+행\s*(특기사항|행동특성 및 종합의견|희망분야)/);
    return m ? m[1] : null;
  }

  function paste(array, element, e) {
    if (!Array.isArray(array) || array.length === 0) return;
    if (!(element instanceof HTMLTextAreaElement)) return;

    const doSinglePaste = () => {
      const first = String(array[0] ?? '');
      e.preventDefault();
      e.stopImmediatePropagation();
      element.focus();
      document.execCommand('insertText', false, first);
    };

    if (array.length < 2) {
      doSinglePaste();
      return;
    }

    const rowNumber = getRowNumber(element);
    if (!rowNumber) {
      alert('일괄 붙여넣기 오류: 행 번호를 확인할 수 없습니다.');
      doSinglePaste();
      return;
    }

    const ok = confirm(`[일괄 붙여넣기]\n\n${rowNumber}행부터 ${array.length}건을 입력하시겠습니까?`);

    if (!ok) {
      doSinglePaste();
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    const selectorSuffix = getSelectorSuffix(element);
    pasteArray(array, rowNumber, selectorSuffix); 
  }

  function setupBasicFeatures() {
    window.addEventListener('paste', (e) => {
      const array = getArrayFromEvent(e);
      const activeElement = document.activeElement;
      paste(array, activeElement, e);
    }, true);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
        e.preventDefault(); e.stopPropagation();
        ipcRenderer.send('req-toggle-search');
      }
    }, true);

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