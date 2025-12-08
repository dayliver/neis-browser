/**
 * [NEIS Browser Injected Scripts Bundle]
 * * 이 객체는 update-config.js에 의해 JSON 문자열 -> Base64로 변환됩니다.
 * Webview에서 실행될 때는 각 키(Key)에 해당하는 스크립트 문자열이 실행됩니다.
 */

// 헬퍼 함수들을 공유하기 위해 공통 모듈 문자열을 정의합니다.
// 이 문자열은 다른 함수들의 앞부분에 concat 되어 주입될 것입니다.
const COMMON_UTILS = `
  // 1. 클릭 시뮬레이션
  const simulateClick = (element, ms = 200) => new Promise(resolve => {
    if (!element) { setTimeout(resolve, ms); return; }
    
    // Trusted 이벤트가 아니므로 InputGuard는 통과시키고, NEIS는 반응하게 함
    const opts = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent('mouseover', opts));
    element.dispatchEvent(new MouseEvent('mousedown', opts));
    element.dispatchEvent(new MouseEvent('mouseup', opts));
    element.dispatchEvent(new MouseEvent('click', opts));
    
    setTimeout(resolve, ms);
  });

  // 2. 텍스트 정규화
  function normalizeToKeyboardChars(text) {
    if (!text) return '';
    return text
      .replace(/[\\u2018\\u2019\\u201A\\u201B\\u2032\\u2035]/g, "'")
      .replace(/[\\u201C\\u201D\\u201E\\u201F\\u2033\\u2036]/g, '"')
      .replace(/[\\u2010-\\u2015]/g, '-')
      .replace(/\\u2026/g, '...')
      .replace(/[\\u00A0\\u3000]/g, ' ')
      .normalize('NFKC')
      .replace(/[\\r\\n\\t\\v\\f]/g, ' ')
      .replace(/\\s{2,}/g, ' ')
      .trim();
  }

  // 3. 행 번호 추출
  function getRowNumber(el) {
    if (!el) return null;
    const aria = el.getAttribute('aria-label') ?? '';
    const m = aria.match(/^(\\d+)행/);
    return m ? Number(m[1]) : null;
  }
`;

// InputGuard 로직 (오버레이 및 이벤트 차단)
const INPUT_GUARD_SCRIPT = `
  const InputGuard = {
    overlay: null,
    handler: (e) => {
      // isTrusted가 true인 실제 사용자 입력만 차단
      if (e.isTrusted) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    },
    lock: () => {
      if (!document.getElementById('neis-guard-overlay')) {
        const div = document.createElement('div');
        div.id = 'neis-guard-overlay';
        div.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; background: rgba(0, 0, 0, 0.05); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 50px; pointer-events: none;";
        const msg = document.createElement('div');
        msg.style.cssText = "background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 30px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);";
        msg.innerText = "⚡ 일괄 입력 중입니다... 마우스와 키보드를 건드리지 마세요.";
        div.appendChild(msg);
        document.body.appendChild(div);
        InputGuard.overlay = div;
      }
      const events = ['mousedown', 'mouseup', 'click', 'keydown', 'keypress', 'keyup', 'wheel', 'contextmenu'];
      events.forEach(evt => window.addEventListener(evt, InputGuard.handler, true));
    },
    unlock: () => {
      const div = document.getElementById('neis-guard-overlay');
      if (div) div.remove();
      const events = ['mousedown', 'mouseup', 'click', 'keydown', 'keypress', 'keyup', 'wheel', 'contextmenu'];
      events.forEach(evt => window.removeEventListener(evt, InputGuard.handler, true));
    }
  };
`;


module.exports = {
  // =================================================================
  // 1. 메뉴 데이터 추출 (extractMenuData)
  // =================================================================
  extractMenuData: `(function() {
    try {
      if (typeof cpr === 'undefined') return null;
      var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0];
      if (!main) return null;

      var ds1 = main.lookup("dsAllMenu");
      var ds2 = main.lookup("dsApproval");
      var ds3 = main.lookup("dsBaseMenu");

      return {
        workMenu: ds1 ? ds1.getRowDataRanged() : [],
        approvalMenu: ds2 ? ds2.getRowDataRanged() : [],
        baseMenu: ds3 ? ds3.getRowDataRanged() : []
      };
    } catch(e) { return null; }
  })()`,


  // =================================================================
  // 2. 메뉴 실행 (executeMenuAction)
  // =================================================================
  executeMenuAction: `(function(payload) {
    try {
      var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0];
      if (!main) return false;

      var type = payload.type;
      var callPage = payload.callPage;
      var menuNm = payload.menuNm;
      var executeId = payload.executeId;
      var upId = payload.upId;
      var params = payload.params;

      if (type === 'BASE' || type === 'APPROVAL') {
        main.callAppMethod("doOpenNoMenu", callPage, menuNm);
      } else {
        if (params) {
           main.callAppMethod("doOpenMenuToMdi", upId, params);
        } else {
           main.callAppMethod("doOpenMenuToMdi", executeId);
        }
      }
      return true;
    } catch(e) { 
      console.error("[Injected] Menu Execution Failed:", e);
      return false; 
    }
  })`,


  // =================================================================
  // 3. 일괄 붙여넣기 (pasteToGrid)
  // =================================================================
  pasteToGrid: `(async function(payload) {
    ${COMMON_UTILS}
    ${INPUT_GUARD_SCRIPT}

    const { clipboardText, startRow, selectorSuffix } = payload;
    
    // 데이터 파싱
    const array = clipboardText.split(/[\\r\\n]+/).filter(t => t.trim().length > 0).map(normalizeToKeyboardChars);

    if (array.length === 0) return { success: false, msg: "데이터 없음" };

    InputGuard.lock();

    let successCount = 0;
    let skippedCount = 0;

    try {
      for (let i = 0; i < array.length; i++) {
        // 비상 탈출
        if (!document.getElementById('neis-guard-overlay')) InputGuard.lock();

        const row = startRow + i;
        const text = array[i];
        
        // 셀 찾기
        const selector = \`div[aria-label^="\${row}행"][aria-label*="\${selectorSuffix}"]\`;
        const element = document.querySelector(selector);
        
        // [조건 2] 마지막 행을 지나서 더 이상 입력할 칸이 없는 경우 -> 중단
        if (!element) {
            skippedCount = array.length - i; // 남은 개수 계산
            break; // 루프 종료
        }

        // 클릭 및 입력 로직
        await simulateClick(element, 150);

        let activeInput = document.activeElement;
        if (!activeInput || (activeInput.tagName !== 'TEXTAREA' && activeInput.tagName !== 'INPUT')) {
            await new Promise(r => setTimeout(r, 100));
            activeInput = document.activeElement;
        }

        if (activeInput && (activeInput.tagName === 'TEXTAREA' || activeInput.tagName === 'INPUT')) {
          activeInput.focus();
          activeInput.select();
          
          const success = document.execCommand('insertText', false, text);
          if (!success) {
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
              nativeSetter.call(activeInput, text);
              activeInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 50)); 
          activeInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
          
          successCount++; // 성공 카운트 증가
        } else {
          console.error(\`[실패] \${row}행 - 입력창 활성화 실패\`);
        }
        
        await new Promise(r => setTimeout(r, 100));
      }

      // 마무리 대기
      await new Promise(r => setTimeout(r, 200));

      // 포커스 초기화 (안전장치)
      if (document.activeElement) document.activeElement.blur();
      window.focus();

      // ★ 결과 리포트 반환
      return { 
        success: true, 
        report: { total: array.length, pasted: successCount, remaining: skippedCount } 
      };

    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      InputGuard.unlock();
    }
  })`
};