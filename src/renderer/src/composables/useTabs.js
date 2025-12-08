import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const tabs = ref([]);
const currentTabId = ref(null);

export function useTabs() {
  const router = useRouter();
  const currentTab = computed(() => tabs.value.find(t => t.id === currentTabId.value));

  const getActiveWebview = () => {
    return currentTab.value?.webview;
  };

  // ★★★ [업그레이드] Deep Blur 기능 ★★★
  const blurActiveWebview = () => {
    const webview = getActiveWebview();
    if (webview) {
      try {
        // 1. [External] Vue 쪽에서 웹뷰 태그 포커스 해제
        webview.blur(); 
        
        // 2. [Internal] 웹뷰 내부로 침투해서 포커스 강제 해제 (좀비 포커스 사살)
        // 붙여넣기 직후 Input에 남아있는 IME 연결을 끊습니다.
        webview.executeJavaScript(`
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
            // 포커스를 body나 null로 날려버림
            window.focus(); 
          }
        `).catch(() => {}); // 에러 무시 (이미 죽은 경우 등)

      } catch (e) { /* 무시 */ }
    }
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
    createTab,
    closeTab,
    switchTab,
    updateTitle
  };
}