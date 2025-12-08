import { ref } from 'vue';
import { useTabs } from './useTabs';
import { useScriptExecutor } from './useScriptExecutor';

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
  const { getActiveWebview, blurActiveWebview } = useTabs();
  const { runRemoteScript } = useScriptExecutor();

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
      return;
    }

    // ★★★ [1] Renderer 차원 방어: 웹뷰 포커스 해제 ★★★
    blurActiveWebview();
    
    // ★★★ [2] Renderer 차원 방어: 윈도우 포커스 ★★★
    window.focus();

    // ★★★ [3] Main Process 차원 방어: OS 입력 채널 강제 회수 (핵심) ★★★
    if (window.electron && window.electron.ipcRenderer) {
      // preload에 fixImeFocus가 없어도 직접 호출 가능하도록 처리
      window.electron.ipcRenderer.send('req-fix-ime-focus');
    }

    if (Array.isArray(menuData.value) && menuData.value.length > 0) {
      isSearchOpen.value = true;
      return;
    }

    console.log('[MenuSearch] 데이터 없음 -> 수집 시작');
    autoFetchMenuData(true);
    
    setTimeout(() => {
       if(!Array.isArray(menuData.value) || menuData.value.length === 0) alert("데이터를 불러오는 중입니다... 잠시 후 다시 시도해주세요.");
       else {
         // 데이터 로드 후 열릴 때도 동일한 3중 방어막 가동
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
      alert("실행 중 오류가 발생했습니다.");
    } else {
      isSearchOpen.value = false;
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