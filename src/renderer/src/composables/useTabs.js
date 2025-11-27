import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

// 상태를 전역으로 관리하고 싶다면 여기서 선언 (Global State)
// 하지만 지금은 BrowserLayout 생명주기 안에서만 쓰이므로 함수 안에서 정의해도 됨.
// 여기서는 '싱글톤'처럼 동작하게 밖으로 빼겠습니다. (Pinia 효과)

const tabs = ref([]);
const currentTabId = ref(null);

export function useTabs() {
  const router = useRouter();

  const currentTab = computed(() => tabs.value.find(t => t.id === currentTabId.value));

  // 탭 생성
  const createTab = (url, title = '새 탭') => {
    const newId = Date.now() + Math.random();
    tabs.value.push({ 
      id: newId, 
      src: url, 
      title: title, 
      webview: null // 나중에 ref로 연결됨
    });
    currentTabId.value = newId;
  };

  // 탭 닫기
  const closeTab = (id) => {
    const idx = tabs.value.findIndex(t => t.id === id);
    if (idx === -1) return;
    
    tabs.value.splice(idx, 1);
    
    // 현재 보고 있던 탭을 닫았으면 다른 탭으로 이동
    if (currentTabId.value === id) {
      if (tabs.value.length > 0) {
        currentTabId.value = tabs.value[tabs.value.length - 1].id;
      } else {
        // 탭이 없으면 지역 선택으로
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

  // 현재 활성 탭의 Webview 객체 반환 (핵심!)
  const getActiveWebview = () => {
    return currentTab.value?.webview;
  };

  return {
    tabs,
    currentTabId,
    currentTab,
    createTab,
    closeTab,
    switchTab,
    updateTitle,
    getActiveWebview
  };
}