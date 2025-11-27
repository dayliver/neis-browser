import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

// 상태를 전역으로 유지하기 위해 함수 밖 선언 (싱글톤 패턴)
const tabs = ref([]);
const currentTabId = ref(null);

export function useTabs() {
  const router = useRouter();

  const currentTab = computed(() => tabs.value.find(t => t.id === currentTabId.value));

  // 현재 활성화된 Webview DOM 객체 반환 (핵심 유틸리티)
  const getActiveWebview = () => {
    return currentTab.value?.webview;
  };

  const createTab = (url, title = '새 탭') => {
    const newId = Date.now() + Math.random();
    tabs.value.push({ 
      id: newId, 
      src: url, 
      title: title, 
      webview: null // ref로 연결될 예정
    });
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

  const switchTab = (id) => {
    currentTabId.value = id;
  };

  const updateTitle = (tab, title) => {
    tab.title = title;
  };

  return {
    tabs,
    currentTabId,
    currentTab,
    getActiveWebview,
    createTab,
    closeTab,
    switchTab,
    updateTitle
  };
}