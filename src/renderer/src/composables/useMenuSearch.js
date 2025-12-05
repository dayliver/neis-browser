import { ref } from 'vue';
import { useTabs } from './useTabs';

const menuData = ref([]); // 초기값을 null 대신 빈 배열 []로 변경
const isSearchOpen = ref(false);
let isFetching = false;
let retryCount = 0;
let fetchTimer = null;
let toggleLock = false;

const STORAGE_KEY = 'menu_usage_history';

// ★ [추가] 메뉴명 기반 검색 키워드 매핑
// 사용자가 자주 찾는 별칭을 여기에 등록합니다.
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

// ... (processMenuData 함수는 그대로 유지) ...
function processMenuData(menuData) {
  if (!menuData) return [];
  
  const { workMenu = [], approvalMenu = [], baseMenu = [] } = menuData;
  const usageHistory = loadUsageHistory();

  // ★ [수정] 경로 생성 헬퍼 함수 (Fallback 맵 지원)
  // map: 주로 찾는 데이터셋 (예: baseMap)
  // fallbackMap: map에 없을 경우 찾아볼 데이터셋 (예: workMap - 전체 트리 구조 보유)
  const buildPath = (item, map, prefix, fallbackMap = {}) => {
    let path = '';
    // 부모 찾기: 1순위 map, 2순위 fallbackMap
    let currId = item.UP_MENU_ID;
    let curr = map[currId] || fallbackMap[currId]; 
    let depth = 0;
    
    // 최대 5단계까지 상위 메뉴 추적
    while(curr && depth < 5) {
      const currName = curr.MENU_NM || '';
      path = path ? `${currName} > ${path}` : currName;
      
      currId = curr.UP_MENU_ID;
      // 다음 부모 찾기
      curr = map[currId] || fallbackMap[currId];
      depth++;
    }
    
    // 최종 경로 반환 (상위 경로가 있으면 붙이고, 없으면 접두어만)
    return path ? `${prefix} > ${path}` : prefix;
  };

  // [1] 업무 메뉴 가공 (WORK)
  // workMap은 전체 메뉴 트리를 가지고 있으므로 다른 메뉴들의 부모 찾기 참조용으로도 쓰임
  const workMap = {};
  workMenu.forEach(item => { workMap[item.MENU_ID] = item; });
  const processedWorkMenu = [];

  Object.values(workMap).forEach(item => {
    // 레벨 데이터는 참고용으로 변환 (실제 필터링에서는 제외)
    const level = item.menuLvl ? Number(item.menuLvl) : (item.level || 0);
    
    // 실행 가능 여부 판단
    const callPage = item.CALL_PAGE ? item.CALL_PAGE.trim() : '';
    const pgmId = item.PGM_ID ? item.PGM_ID.trim() : '';
    
    const isExecutable = 
        callPage.length > 0 && 
        callPage !== 'edu//' && 
        pgmId.length > 0;

    // 레벨 조건(level >= 3 등)을 완전히 제거하고, 오직 '실행 가능성'으로만 판단
    if (isExecutable) {
      let name = item.MENU_NM || '';
      
      // 상위 메뉴와 이름이 같은 경우 '(바로가기)' 접미사 추가
      const parent = workMap[item.UP_MENU_ID];
      if (parent && (parent.MENU_NM || '') === name) {
        name += ' (바로가기)';
      }

      // ★ [추가] 키워드 찾기 (메뉴명 기준)
      const rawName = item.MENU_NM || '';
      const keywordByName = MENU_NAME_KEYWORDS[rawName] || '';
      
      processedWorkMenu.push({
        type: 'WORK', // ★ 타입 구분
        name: name, 
        path: buildPath(item, workMap, '[업무]'), // ★ 공통 경로 로직 사용
        id: item.MENU_ID,
        executeId: item.V_MENU_ID || item.MENU_ID,
        level: level,
        upId: item.UP_MENU_ID,
        pgmId: item.PGM_ID,
        raw: item,
        callPage: item.CALL_PAGE,
        count: usageHistory[item.MENU_ID] || 0, // ★ 실행 횟수 주입
        keywords: keywordByName // ★ 키워드 필드 추가
      });
    }
  });

  // [2] 기본 메뉴 가공 (BASE)
  const baseMap = {};
  baseMenu.forEach(item => { baseMap[item.MENU_ID] = item; });
  const processedBaseMenu = [];

  Object.values(baseMap).forEach(item => {
      // 기본 메뉴도 CALL_PAGE 유효성 검사 강화
      const callPage = item.CALL_PAGE ? item.CALL_PAGE.trim() : '';
      if (callPage.length > 0 && callPage !== 'edu//') {
          let name = item.MENU_NM || '';
          
          // 부모 찾기도 fallback 적용
          const parent = baseMap[item.UP_MENU_ID] || workMap[item.UP_MENU_ID];
          if (parent && (parent.MENU_NM || '') === name) {
            name += ' (바로가기)';
          }

          // ★ [추가] 키워드 찾기
          const rawName = item.MENU_NM || '';
          const keywordByName = MENU_NAME_KEYWORDS[rawName] || '';

          processedBaseMenu.push({
            type: 'BASE', // ★ 타입 구분
            name: name,
            // ★ [수정] workMap을 fallbackMap으로 전달하여 끊긴 경로(복무 등)를 찾음
            path: buildPath(item, baseMap, '[기본]', workMap),
            id: item.MENU_ID,
            executeId: item.MENU_ID,
            level: Number(item.menuLvl),
            upId: item.UP_MENU_ID,
            pgmId: item.PGM_ID,
            raw: item,
            callPage: item.CALL_PAGE,
            count: usageHistory[item.MENU_ID] || 0,
            keywords: keywordByName
          });
      }
  });

  // [3] 승인 메뉴 가공 (APPROVAL)
  const processedApprovalMenu = approvalMenu.map(item => {
    // ★ [추가] 키워드 찾기
    const rawName = item.MENU_NM || '';
    const keywordByName = MENU_NAME_KEYWORDS[rawName] || '';

    return {
      type: 'APPROVAL', // ★ 타입 구분
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
      keywords: keywordByName
    };
  });

  // 배열 합치기
  return [...processedWorkMenu, ...processedBaseMenu, ...processedApprovalMenu];
}

export function useMenuSearch() {
  const { getActiveWebview } = useTabs();

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
      e.preventDefault(); // 기본 찾기 방지
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

    if (Array.isArray(menuData.value) && menuData.value.length > 0) {
      isSearchOpen.value = true;
      return;
    }

    console.log('[MenuSearch] 데이터 없음 -> 수집 시작');
    autoFetchMenuData(true);
    
    setTimeout(() => {
       if(!Array.isArray(menuData.value) || menuData.value.length === 0) alert("데이터를 불러오는 중입니다... 잠시 후 다시 시도해주세요.");
       else isSearchOpen.value = true;
    }, 500);
  };

  const executeMenu = async (targetId) => {
    const webview = getActiveWebview();
    if (!webview || !Array.isArray(menuData.value)) return;

    const item = menuData.value.find(i => i.id === targetId || i.executeId === targetId);
    if (!item) return;

    // ★ [추가] 실행 횟수 업데이트 및 저장
    item.count = (item.count || 0) + 1;
    const history = loadUsageHistory();
    history[item.id] = item.count; 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

    console.log(`[실행] ${item.name} (${item.type}) - 누적 ${item.count}회`);
    
    let script = '';

    if (item.type === 'BASE' || item.type === 'APPROVAL') {
        const callPage = item.callPage || item.raw.callPage; 
        console.log(`👉 ${item.type} 실행: doOpenNoMenu 호출 (${callPage})`);
        
        script = `
          (function(){
            try {
              var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0];
              if(main) main.callAppMethod("doOpenNoMenu", "${callPage}", "${item.name}");
            } catch(e) { console.error(e); }
          })()
        `;
    } else {
        if (item.level > 4 && item.upId) {
            const params = { 
              menuId: item.id, 
              menuNm: item.name, 
              pgeId: item.pgmId,
              ...item.raw 
            };
            const paramStr = JSON.stringify(params).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            console.log(`👉 WORK 4단계 실행: 부모(${item.upId}) 호출 + 파라미터`);
            script = `(function(){ try { var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0]; if(main) main.callAppMethod("doOpenMenuToMdi", "${item.upId}", ${paramStr}); } catch(e) { console.error(e); } })()`;
        } else {
            console.log(`👉 WORK 일반 실행: ${item.executeId} 호출`);
            script = `(function(){ try { var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0]; if(main) main.callAppMethod("doOpenMenuToMdi", "${item.executeId}"); } catch(e) { console.error(e); } })()`;
        }
    }
    
    try {
      await webview.executeJavaScript(script);
      isSearchOpen.value = false;
    } catch (err) {
      console.error("[Vue] 실행 실패:", err);
      alert("실행 중 오류가 발생했습니다.");
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

    try {
      const result = await webview.executeJavaScript(`
        (function() {
          try {
            if (typeof cpr === 'undefined') return null;
            var mainDef = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index");
            if (!mainDef) return null;
            var mainApp = mainDef.getInstances()[0];
            if (!mainApp) return null;

            var dsWork = mainApp.lookup("dsAllMenu");
            var dsAppr = mainApp.lookup("dsApproval");
            var dsBase = mainApp.lookup("dsBaseMenu");

            return {
              workMenu: dsWork ? dsWork.getRowDataRanged() : [],
              approvalMenu: dsAppr ? dsAppr.getRowDataRanged() : [],
              baseMenu: dsBase ? dsBase.getRowDataRanged() : []
            };
          } catch(e) { return null; }
        })()
      `);

      // ★ [안정화 로직 추가]
      const hasWork = result && result.workMenu.length > 0;
      const hasOther = result && (result.approvalMenu.length > 0 || result.baseMenu.length > 0);
      
      // 성공 조건 강화:
      // 1. 업무 메뉴가 로드되면 즉시 성공
      // 2. 업무 메뉴가 없더라도 다른 메뉴가 있고, 10초(retryCount > 10) 이상 기다렸다면 성공으로 인정
      const isSuccess = hasWork || (hasOther && retryCount > 10);

      if (isSuccess) {
        console.log(`✨ [AutoFetch] 성공! (시도: ${retryCount})`);
        console.log(`- 업무메뉴: ${result.workMenu.length}건`);
        console.log(`- 승인메뉴: ${result.approvalMenu.length}건`);
        console.log(`- 기본메뉴: ${result.baseMenu.length}건`);
        
        const processed = processMenuData(result);
        
        if (Array.isArray(processed)) {
            menuData.value = processed;
        } else {
            console.error("Critical Error: processMenuData did not return an array!", processed);
            menuData.value = [];
        }
        
        retryCount = 0;
        isFetching = false;
      } else {
        isFetching = false;
        if (retryCount < 60) {
          retryCount++;
          if (hasOther && !hasWork) {
             console.log(`⌛ [AutoFetch] 업무 메뉴 로딩 대기 중... (${retryCount}/60)`);
          }
          fetchTimer = setTimeout(() => autoFetchMenuData(), 1000);
        }
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      isFetching = false;
      if (retryCount < 60) {
        retryCount++;
        fetchTimer = setTimeout(() => autoFetchMenuData(), 1000);
      }
    }
  };

  return { menuData, isSearchOpen, setupMenuListeners, openMenuSearch, executeMenu, autoFetchMenuData };
}