import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

// 상태를 전역으로 유지 (싱글톤 패턴)
const tabs = ref([]);
const currentTabId = ref(null);

export function useTabs() {
  const router = useRouter();
  const currentTab = computed(() => tabs.value.find(t => t.id === currentTabId.value));

  const getActiveWebview = () => {
    return currentTab.value?.webview;
  };

  /**
   * [포커스 제거]
   * Webview가 포커스를 쥐고 있으면 Vue의 단축키나 입력창이 안 먹힐 때 사용
   */
  const blurActiveWebview = () => {
    const webview = getActiveWebview();
    if (webview) {
      try {
        // 1. [External] Vue 쪽에서 웹뷰 태그 포커스 해제
        webview.blur(); 
        
        // 2. [Internal] 웹뷰 내부로 침투해서 포커스 강제 해제
        webview.executeJavaScript(`
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
            window.focus(); 
          }
        `).catch(() => {});
      } catch (e) { /* 무시 */ }
    }
  };

  /**
   * ★ [포커스 복구 - 핵심 로직] ★
   * 모달이 닫힌 후 "좀비 포커스" 상태(입력 불가)를 방지하기 위해
   * 강제로 포커스를 주고 "가짜 클릭"을 발생시켜 IME를 깨웁니다.
   */
  const focusActiveWebview = () => {
    const webview = getActiveWebview();
    if (!webview) return;

    // 1. 기본 포커스 시도
    webview.focus();

    // 2. [Plan C] 클릭 시뮬레이션 (IME Wake-up)
    // OS가 "사용자가 이곳을 클릭했다"고 착각하게 만듭니다.
    webview.executeJavaScript(`
      (function() {
        try {
          const el = document.activeElement || document.body;
          if (el) {
            // 마우스 클릭 이벤트 강제 발생
            const opts = { bubbles: true, cancelable: true, view: window };
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            
            // 다시 한 번 포커스 확인
            el.focus();
          }
        } catch(e) {}
      })();
    `).catch(() => {});
  };

  const createTab = (url, title = '새 탭') => {
    const newId = Date.now() + Math.random();
    tabs.value.push({ id: newId, src: url, title: title, webview: null });
    currentTabId.value = newId;
  };

  const closeTab = (id) => {
    const idx = tabs.value.findIndex(t => t.id === id);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    
    if (currentTabId.value === id) {
      if (tabs.value.length > 0) {
        currentTabId.value = tabs.value[tabs.value.length - 1].id;
      } else {
        router.push({ name: 'SelectRegion' });
      }
    }
  };

  const switchTab = (id) => { currentTabId.value = id; };
  const updateTitle = (tab, title) => { tab.title = title; };

  return {
    tabs,
    currentTabId,
    currentTab,
    getActiveWebview,
    blurActiveWebview,
    focusActiveWebview, // ★ 추가됨
    createTab,
    closeTab,
    switchTab,
    updateTitle
  };
}