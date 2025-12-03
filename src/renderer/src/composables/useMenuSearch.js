import { ref, onUnmounted, toRaw } from 'vue'; // toRaw 추가
import { useTabs } from './useTabs';

const menuData = ref([]); // 초기값을 null 대신 빈 배열 []로 변경
const isSearchOpen = ref(false);
let isFetching = false;
let retryCount = 0;
let fetchTimer = null;
let toggleLock = false;

// ... (processMenuData 함수는 그대로 유지) ...
function processMenuData(menuData) {
  if (!menuData) return [];
  
  const { workMenu = [], approvalMenu = [], baseMenu = [] } = menuData;

  // 공통 경로 생성 헬퍼 함수
  const buildPath = (item, map, prefix) => {
    let path = '';
    let curr = map[item.UP_MENU_ID]; // 상위 메뉴 찾기
    let depth = 0;
    
    // 최대 5단계까지 상위 메뉴 추적
    while(curr && depth < 5) {
      const currName = curr.MENU_NM || '';
      path = path ? `${currName} > ${path}` : currName;
      curr = map[curr.UP_MENU_ID];
      depth++;
    }
    
    // 최종 경로 반환 (상위 경로가 있으면 붙이고, 없으면 접두어만)
    return path ? `${prefix} > ${path}` : prefix;
  };

  // [1] 업무 메뉴 가공 (WORK)
  const workMap = {};
  workMenu.forEach(item => { workMap[item.MENU_ID] = item; });
  const processedWorkMenu = [];

  Object.values(workMap).forEach(item => {
    const level = item.menuLvl ? Number(item.menuLvl) : (item.level || 0);
    // 업무 메뉴 필터링 (레벨 3 이상 혹은 호출 페이지 존재)
    if ((level >= 3 || (item.CALL_PAGE && item.CALL_PAGE.trim() !== "")) && level !== 1 && level !== 2) {
      processedWorkMenu.push({
        type: 'WORK', // ★ 타입 구분
        name: item.MENU_NM || '', 
        path: buildPath(item, workMap, '[업무]'), // ★ 공통 경로 로직 사용
        id: item.MENU_ID,
        executeId: item.V_MENU_ID || item.MENU_ID,
        level: level,
        upId: item.UP_MENU_ID,
        pgmId: item.PGM_ID,
        raw: item,
        callPage: item.CALL_PAGE
      });
    }
  });

  // [2] 기본 메뉴 가공 (BASE) - ★ 여기도 계층 구조가 있으므로 Map핑 필요
  const baseMap = {};
  baseMenu.forEach(item => { baseMap[item.MENU_ID] = item; });
  const processedBaseMenu = [];

  Object.values(baseMap).forEach(item => {
      // 기본 메뉴는 모든 리프 노드(페이지 호출 가능)를 대상으로 함
      if (item.CALL_PAGE && item.CALL_PAGE.trim() !== "") {
          processedBaseMenu.push({
            type: 'BASE', // ★ 타입 구분
            name: item.MENU_NM || '',
            path: buildPath(item, baseMap, '[기본]'), // ★ 기본 메뉴도 경로 추적 적용
            id: item.MENU_ID,
            executeId: item.MENU_ID,
            level: Number(item.menuLvl),
            upId: item.UP_MENU_ID,
            pgmId: item.PGM_ID,
            raw: item,
            callPage: item.CALL_PAGE
          });
      }
  });

  // [3] 승인 메뉴 가공 (APPROVAL) - 보통 1단계지만 포맷 통일
  const processedApprovalMenu = approvalMenu.map(item => ({
    type: 'APPROVAL', // ★ 타입 구분
    name: item.MENU_NM || '',
    path: `[승인] > ${item.MENU_NM || ''}`,
    id: item.MENU_ID,
    executeId: item.MENU_ID,
    level: Number(item.menuLvl),
    upId: item.UP_MENU_ID,
    pgmId: item.PGM_ID,
    raw: item,
    callPage: item.CALL_PAGE // 승인 메뉴는 callPage가 소문자일 수 있음 (주의)
  }));

  // 배열 합치기
  return [...processedWorkMenu, ...processedBaseMenu, ...processedApprovalMenu];
}

export function useMenuSearch() {
  const { getActiveWebview } = useTabs();

  // ... (setupMenuListeners, handleKeydown, openMenuSearch, executeMenu 동일) ...
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

    // menuData.value가 배열이고 길이가 있는지 확인
    if (Array.isArray(menuData.value) && menuData.value.length > 0) {
      isSearchOpen.value = true;
      return;
    }

    console.log('[MenuSearch] 데이터 없음 -> 수집 시작');
    autoFetchMenuData(true);
    
    setTimeout(() => {
       // 여기도 배열 체크 추가
       if(!Array.isArray(menuData.value) || menuData.value.length === 0) alert("데이터를 불러오는 중입니다... 잠시 후 다시 시도해주세요.");
       else isSearchOpen.value = true;
    }, 500);
  };

  const executeMenu = async (targetId) => {
    const webview = getActiveWebview();
    // 배열인지 확인
    if (!webview || !Array.isArray(menuData.value)) return;

    const item = menuData.value.find(i => i.id === targetId || i.executeId === targetId);
    if (!item) return;

    console.log(`[실행] ${item.name} (${item.type})`);
    
    let script = '';

    // ★ [수정] 메뉴 타입에 따라 실행 함수 분기 처리
    if (item.type === 'BASE' || item.type === 'APPROVAL') {
        // 기본 메뉴 및 승인 메뉴는 doOpenNoMenu 사용
        // doOpenNoMenu(psAppId, psAppTitle, poParam, opCurMnuId, opCurMngAuth)
        const callPage = item.callPage || item.raw.callPage; // 승인메뉴는 camelCase 주의
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
        // 업무 메뉴 (WORK) - 기존 로직 유지
        // 4단계 이상 (내부 탭)
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
            // 3단계 (일반 페이지)
            console.log(`👉 WORK 3단계 실행: ${item.executeId} 호출`);
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

      if (result && (result.workMenu.length > 0 || result.approvalMenu.length > 0 || result.baseMenu.length > 0)) {
        console.log(`✨ [AutoFetch] 성공!`);
        console.log(`- 업무메뉴: ${result.workMenu.length}건`);
        console.log(`- 승인메뉴: ${result.approvalMenu.length}건`);
        console.log(`- 기본메뉴: ${result.baseMenu.length}건`);
        
        // ★ 중요: 배열로 확실하게 변환하여 저장
        const processed = processMenuData(result);
        
        // Vue 3의 반응성 시스템이 배열을 감지할 수 있도록 값 할당
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