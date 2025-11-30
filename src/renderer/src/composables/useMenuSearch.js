import { ref, onUnmounted } from 'vue';
import { useTabs } from './useTabs';

const menuData = ref(null);
const isSearchOpen = ref(false);
let isFetching = false;
let retryCount = 0;
let fetchTimer = null;
let toggleLock = false; // ★ 중복 실행 방지 락

export function useMenuSearch() {
  const { getActiveWebview } = useTabs();

  const setupMenuListeners = () => {
    if (!window.electron?.ipcRenderer) return;

    // 단축키 수신 (Main)
    window.electron.ipcRenderer.removeAllListeners('cmd-toggle-search');
    window.electron.ipcRenderer.on('cmd-toggle-search', () => {
      console.log('[Vue] 단축키 수신');
      openMenuSearch();
    });
    
    // Vue 창 내부 단축키
    window.removeEventListener('keydown', handleKeydown);
    window.addEventListener('keydown', handleKeydown);
  };

  const handleKeydown = (e) => {
    if ((e.ctrlKey && e.key === 'f') || e.key === 'F3') {
      e.preventDefault(); // 기본 찾기 방지
      openMenuSearch();
    }
  };

  // ★ [수정] 토글 안정화 (Debounce Lock)
  const openMenuSearch = () => {
    if (toggleLock) return; // 락 걸려있으면 무시
    toggleLock = true;
    setTimeout(() => { toggleLock = false; }, 300); // 0.3초 쿨타임

    if (isSearchOpen.value) {
      isSearchOpen.value = false;
      return;
    }

    if (menuData.value && menuData.value.length > 0) {
      isSearchOpen.value = true;
      return;
    }

    // 데이터 없으면 자동 수집 시작
    console.log('[MenuSearch] 데이터 없음 -> 수집 시작');
    autoFetchMenuData(true);
    
    setTimeout(() => {
       if(!menuData.value) alert("데이터를 불러오는 중입니다... 잠시 후 다시 시도해주세요.");
       else isSearchOpen.value = true;
    }, 500);
  };

  // ★ [수정] 메뉴 실행 로직 (4단계 -> 부모 호출 + 파라미터)
  const executeMenu = async (targetId) => {
    const webview = getActiveWebview();
    if (!webview || !menuData.value) return;

    // ID로 아이템 찾기
    const item = menuData.value.find(i => i.id === targetId || i.executeId === targetId);
    if (!item) return;

    console.log(`[실행] ${item.name} (Lvl: ${item.level})`);

    let script = '';

    // 4단계 이상 (내부 탭)
    if (item.level >= 4 && item.upId) {
       // 부모(3단계)를 실행 대상으로 설정
       // 파라미터에 내 정보(4단계)를 담음
       const params = { 
         menuId: item.id, 
         menuNm: item.name, 
         pgeId: item.pgmId,
         // 필요한 경우 원본 속성들 추가
         ...item.raw 
       };
       
       // JSON 문자열 이스케이프
       const paramStr = JSON.stringify(params).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

       console.log(`👉 4단계 실행: 부모(${item.upId}) 호출 + 파라미터`);
       
       script = `
         (function(){
           try {
             var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0];
             // doOpenMenuToMdi(메뉴ID, 파라미터)
             if(main) main.callAppMethod("doOpenMenuToMdi", "${item.upId}", ${paramStr});
           } catch(e) { console.error(e); }
         })()
       `;
    } 
    // 3단계 (일반 페이지)
    else {
       console.log(`👉 3단계 실행: ${item.executeId} 호출`);
       script = `
         (function(){
           try {
             var main = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index").getInstances()[0];
             if(main) main.callAppMethod("doOpenMenuToMdi", "${item.executeId}");
           } catch(e) { console.error(e); }
         })()
       `;
    }
    
    try {
      await webview.executeJavaScript(script);
      isSearchOpen.value = false;
    } catch (err) {
      console.error("[Vue] 실행 실패:", err);
      alert("실행 중 오류가 발생했습니다.");
    }
  };

  // 데이터 자동 수집
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
            var ds = mainApp.lookup("dsAllMenu");
            return ds ? ds.getRowDataRanged() : null;
          } catch(e) { return null; }
        })()
      `);

      if (result && result.length > 0) {
        console.log(`✨ [AutoFetch] 성공! ${result.length}건 확보.`);
        menuData.value = processMenuData(result);
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
      isFetching = false;
      if (retryCount < 60) {
          retryCount++;
          fetchTimer = setTimeout(() => autoFetchMenuData(), 1000);
      }
    }
  };

  // 데이터 가공 헬퍼
  function processMenuData(list) {
    const map = {};
    const result = [];
    list.forEach(item => { map[item.MENU_ID] = item; });

    Object.values(map).forEach(item => {
      // 실행 가능한 메뉴 필터링
      if ((item.level >= 3 || (item.CALL_PAGE && item.CALL_PAGE.trim() !== "")) && item.menuLvl != 1 && item.menuLvl != 2) {
        let path = '';
        let curr = map[item.UP_MENU_ID];
        let depth = 0;
        while(curr && depth < 5) {
          path = path ? `${curr.MENU_NM} > ${path}` : curr.MENU_NM;
          curr = map[curr.UP_MENU_ID];
          depth++;
        }
        result.push({
          name: item.MENU_NM,
          path: path,
          id: item.MENU_ID,
          executeId: item.V_MENU_ID || item.MENU_ID,
          level: Number(item.menuLvl),
          upId: item.UP_MENU_ID,
          pgmId: item.PGM_ID,
          raw: item,
          callPage: item.CALL_PAGE
        });
      }
    });
    return result;
  }

  return { menuData, isSearchOpen, setupMenuListeners, openMenuSearch, executeMenu, autoFetchMenuData };
}