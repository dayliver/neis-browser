import { ref } from 'vue';
import { useTabs } from './useTabs';
import { useScriptExecutor } from './useScriptExecutor';
// ★ [신규] 모달 사용을 위한 Import
import { useModal } from './useModal';

const menuData = ref([]);
const isSearchOpen = ref(false);
let isFetching = false;
let retryCount = 0;
let fetchTimer = null;
let toggleLock = false;

const STORAGE_KEY = 'menu_usage_history';
const MENU_NAME_KEYWORDS = {
  '개인근무상황관리': '조퇴 외출 지각 병가 연가 공가 특별휴가'
};

const loadUsageHistory = () => {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : {};
  } catch (e) {
    console.error('기록 로드 실패', e);
    return {};
  }
};

function processMenuData(menuData) {
  if (!menuData) return [];
  
  const { workMenu = [], approvalMenu = [], baseMenu = [] } = menuData;
  const usageHistory = loadUsageHistory();

  const buildPath = (item, map, prefix, fallbackMap = {}) => {
    let path = '';
    let currId = item.UP_MENU_ID;
    let curr = map[currId] || fallbackMap[currId]; 
    let depth = 0;
    
    while(curr && depth < 5) {
      const currName = curr.MENU_NM || '';
      path = path ? `${currName} > ${path}` : currName;
      currId = curr.UP_MENU_ID;
      curr = map[currId] || fallbackMap[currId];
      depth++;
    }
    return path ? `${prefix} > ${path}` : prefix;
  };

  // [1] 업무 메뉴
  const workMap = {};
  workMenu.forEach(item => { workMap[item.MENU_ID] = item; });
  const processedWorkMenu = [];

  Object.values(workMap).forEach(item => {
    const level = item.menuLvl ? Number(item.menuLvl) : (item.level || 0);
    const callPage = item.CALL_PAGE ? item.CALL_PAGE.trim() : '';
    const pgmId = item.PGM_ID ? item.PGM_ID.trim() : '';
    
    const isExecutable = callPage.length > 0 && callPage !== 'edu//' && pgmId.length > 0;

    if (isExecutable) {
      let name = item.MENU_NM || '';
      const parent = workMap[item.UP_MENU_ID];
      if (parent && (parent.MENU_NM || '') === name) name += ' (바로가기)';
      const rawName = item.MENU_NM || '';
      
      processedWorkMenu.push({
        type: 'WORK',
        name: name, 
        path: buildPath(item, workMap, '[업무]'),
        id: item.MENU_ID,
        executeId: item.V_MENU_ID || item.MENU_ID,
        level: level,
        upId: item.UP_MENU_ID,
        pgmId: item.PGM_ID,
        raw: item,
        callPage: item.CALL_PAGE,
        count: usageHistory[item.MENU_ID] || 0,
        keywords: MENU_NAME_KEYWORDS[rawName] || ''
      });
    }
  });

  // [2] 기본 메뉴
  const baseMap = {};
  baseMenu.forEach(item => { baseMap[item.MENU_ID] = item; });
  const processedBaseMenu = [];

  Object.values(baseMap).forEach(item => {
      const callPage = item.CALL_PAGE ? item.CALL_PAGE.trim() : '';
      if (callPage.length > 0 && callPage !== 'edu//') {
          let name = item.MENU_NM || '';
          const parent = baseMap[item.UP_MENU_ID] || workMap[item.UP_MENU_ID];
          if (parent && (parent.MENU_NM || '') === name) name += ' (바로가기)';
          const rawName = item.MENU_NM || '';

          processedBaseMenu.push({
            type: 'BASE',
            name: name,
            path: buildPath(item, baseMap, '[기본]', workMap),
            id: item.MENU_ID,
            executeId: item.MENU_ID,
            level: Number(item.menuLvl),
            upId: item.UP_MENU_ID,
            pgmId: item.PGM_ID,
            raw: item,
            callPage: item.CALL_PAGE,
            count: usageHistory[item.MENU_ID] || 0,
            keywords: MENU_NAME_KEYWORDS[rawName] || ''
          });
      }
  });

  // [3] 승인 메뉴
  const processedApprovalMenu = approvalMenu.map(item => {
    const rawName = item.MENU_NM || '';
    return {
      type: 'APPROVAL',
      name: item.MENU_NM || '',
      path: `[승인] > ${item.MENU_NM || ''}`,
      id: item.MENU_ID,
      executeId: item.MENU_ID,
      level: Number(item.menuLvl),
      upId: item.UP_MENU_ID,
      pgmId: item.PGM_ID,
      raw: item,
      callPage: item.CALL_PAGE,
      count: usageHistory[item.MENU_ID] || 0,
      keywords: MENU_NAME_KEYWORDS[rawName] || ''
    };
  });

  return [...processedWorkMenu, ...processedBaseMenu, ...processedApprovalMenu];
}

export function useMenuSearch() {
  // ★ [수정] focusActiveWebview 추가 가져오기
  const { getActiveWebview, blurActiveWebview, focusActiveWebview } = useTabs();
  const { runRemoteScript } = useScriptExecutor();
  // ★ [신규] 모달 인스턴스
  const modal = useModal();

  const setupMenuListeners = () => {
    if (!window.electron?.ipcRenderer) return;

    window.electron.ipcRenderer.removeAllListeners('cmd-toggle-search');
    window.electron.ipcRenderer.on('cmd-toggle-search', () => {
      console.log('[Vue] 단축키 수신');
      openMenuSearch();
    });
    
    window.removeEventListener('keydown', handleKeydown);
    window.addEventListener('keydown', handleKeydown);
  };

  const handleKeydown = (e) => {
    if ((e.ctrlKey && e.key === 'f') || e.key === 'F3') {
      e.preventDefault(); 
      openMenuSearch();
    }
  };

  const openMenuSearch = () => {
    if (toggleLock) return;
    toggleLock = true;
    setTimeout(() => { toggleLock = false; }, 300);

    if (isSearchOpen.value) {
      isSearchOpen.value = false;
      // 닫을 때도 안전하게 포커스 복구
      focusActiveWebview();
      return;
    }

    // ★ 3중 방어막 가동
    blurActiveWebview(); // 1. 기존 포커스 제거
    window.focus();      // 2. Vue 앱 포커스
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.send('req-fix-ime-focus'); // 3. Main Process 지원 사격
    }

    if (Array.isArray(menuData.value) && menuData.value.length > 0) {
      isSearchOpen.value = true;
      return;
    }

    console.log('[MenuSearch] 데이터 없음 -> 수집 시작');
    autoFetchMenuData(true);
    
    // 데이터 로딩 대기
    setTimeout(async () => {
       if(!Array.isArray(menuData.value) || menuData.value.length === 0) {
         // ★ [수정] 네이티브 alert -> 커스텀 modal.alert 사용
         await modal.alert("알림", "데이터를 불러오는 중입니다... 잠시 후 다시 시도해주세요.");
         
         // ★ [신규] 모달 확인 후 포커스 복구 (Webview 클릭 시뮬레이션)
         focusActiveWebview();
       } else {
         // 데이터 로드 성공 시 열기
         blurActiveWebview();
         window.focus();
         if (window.electron && window.electron.ipcRenderer) {
            window.electron.ipcRenderer.send('req-fix-ime-focus');
         }
         isSearchOpen.value = true;
       }
    }, 500);
  };

  const executeMenu = async (targetId) => {
    const webview = getActiveWebview();
    if (!webview || !Array.isArray(menuData.value)) return;

    const item = menuData.value.find(i => i.id === targetId || i.executeId === targetId);
    if (!item) return;

    item.count = (item.count || 0) + 1;
    const history = loadUsageHistory();
    history[item.id] = item.count; 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

    console.log(`[실행] ${item.name} (${item.type})`);
    
    const payload = {
      type: item.type,
      callPage: item.callPage || item.raw.callPage,
      menuNm: item.name,
      executeId: item.executeId,
      upId: item.upId,
      params: (item.level > 4 && item.upId) ? { 
          menuId: item.id, 
          menuNm: item.name, 
          pgeId: item.pgmId,
          ...item.raw 
      } : null
    };

    const res = await runRemoteScript(webview, 'executeMenuAction', payload);

    if (!res.success) {
      console.error("[Vue] 실행 실패:", res.error);
      // ★ [수정] 에러 알림도 커스텀 모달로
      await modal.alert("오류", "실행 중 오류가 발생했습니다.");
      // 에러 확인 후 포커스 복구
      focusActiveWebview();
    } else {
      isSearchOpen.value = false;
      // 성공적으로 메뉴 실행 후에도 포커스를 Webview로 돌려줌
      focusActiveWebview();
    }
  };

  const autoFetchMenuData = async (forceReset = false) => {
    const webview = getActiveWebview();
    if (!webview) return;

    if (forceReset) {
      retryCount = 0;
      if (fetchTimer) clearTimeout(fetchTimer);
      isFetching = false;
    }

    if (isFetching) return;
    isFetching = true;

    const res = await runRemoteScript(webview, 'extractMenuData');
    
    if (!res.success || !res.result) {
        console.warn("Fetch result invalid or failed:", res.error);
        handleRetry(webview);
        return;
    }

    const result = res.result;
    const hasWork = result.workMenu && result.workMenu.length > 0;
    const hasOther = (result.approvalMenu && result.approvalMenu.length > 0) || (result.baseMenu && result.baseMenu.length > 0);
    const isSuccess = hasWork || (hasOther && retryCount > 10);

    if (isSuccess) {
      console.log(`✨ [AutoFetch] 성공! (시도: ${retryCount})`);
      const processed = processMenuData(result);
      if (Array.isArray(processed)) menuData.value = processed;
      else menuData.value = [];
      
      retryCount = 0;
      isFetching = false;
    } else {
      handleRetry(webview, hasOther, hasWork);
    }
  };

  const handleRetry = (webview, hasOther = false, hasWork = false) => {
    isFetching = false;
    if (retryCount < 60) {
      retryCount++;
      if (hasOther && !hasWork) {
          console.log(`⌛ [AutoFetch] 업무 메뉴 로딩 대기 중... (${retryCount}/60)`);
      }
      fetchTimer = setTimeout(() => autoFetchMenuData(), 1000);
    }
  }

  return { menuData, isSearchOpen, setupMenuListeners, openMenuSearch, executeMenu, autoFetchMenuData };
}