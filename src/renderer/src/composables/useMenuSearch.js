import { ref, onUnmounted } from 'vue';
import { useTabs } from './useTabs';

const menuData = ref(null);
const isSearchOpen = ref(false);

export function useMenuSearch() {
  const { getActiveWebview } = useTabs();

  // 1. 초기화 및 리스너 설정
  const setupMenuListeners = () => {
    if (!window.electron?.ipcRenderer) return;

    // ★★★ [핵심] Main에서 신호가 오면 Alert 띄우기 ★★★
    window.electron.ipcRenderer.on('cmd-show-alert', () => {
      console.log('[Vue] 단축키 신호 수신');
      
      // 요청하신 단순 Alert
      alert('단축키 입력 감지');
    });

    window.electron.ipcRenderer.removeAllListeners('cmd-toggle-search');
    window.electron.ipcRenderer.on('cmd-toggle-search', () => {
      
      console.log('[Vue] 단축키(F3) 수신 -> 검색창 토글');
      
      // ★★★ [수정] Alert 지우고 이 함수 실행 ★★★
      openMenuSearch(); 
    });

    // 데이터 수신
    window.electron.ipcRenderer.removeAllListeners('res-extract-menu-to-vue');
    window.electron.ipcRenderer.on('res-extract-menu-to-vue', (rawData) => {
      console.log('✨ [Vue] 메뉴 데이터 수신 완료');
      
      const searchList = processMenuData(rawData);
      menuData.value = searchList;
      
      if (searchList.length > 0) {
         isSearchOpen.value = true; // 데이터 오면 모달 열기
      } else {
         alert('데이터가 비어있습니다.');
      }
    });
  };

  // 2. 돋보기 버튼 클릭 시
  const openMenuSearch = async () => {
    // (A) 이미 열려있으면 닫기 (토글)
    if (isSearchOpen.value) {
      isSearchOpen.value = false;
      return;
    }

    // (B) 데이터가 이미 있으면 바로 열기
    if (menuData.value && menuData.value.length > 0) {
      isSearchOpen.value = true;
      return;
    }

    // (C) 데이터 없으면 추출 시도
    const webview = getActiveWebview();
    if (!webview) return alert('활성화된 탭이 없습니다.');

    console.log('[MenuSearch] 데이터 추출 요청 전송...');
    
    // 1차 시도: 직접 실행 (빠름)
    try {
      const result = await webview.executeJavaScript(`
        (function() {
          try {
            if (typeof cpr === 'undefined') return null;
            var mainDef = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index");
            var mainApp = mainDef ? mainDef.getInstances()[0] : null;
            var ds = mainApp ? mainApp.lookup("dsAllMenu") : null;
            return ds ? ds.getRowDataRanged() : null;
          } catch(e) { return null; }
        })()
      `);

      if (result && result.length > 0) {
        menuData.value = processMenuData(result);
        isSearchOpen.value = true;
        console.log('✨ [Direct] 데이터 확보 성공');
      } else {
        // 실패 시 Preload에게 정식 요청 (Backup)
        webview.send('req-extract-menu');
      }
    } catch (e) {
      webview.send('req-extract-menu');
    }
  };

  // 3. 메뉴 실행 함수
  const executeMenu = async (targetId) => {
    const webview = getActiveWebview();
    if (!webview || !menuData.value) return;

    const item = menuData.value.find(i => i.id === targetId || i.executeId === targetId);
    if (!item) return;

    console.log(`[실행] ${item.name} (ID: ${item.executeId})`);

    // ★ 성공했던 단순 ID 호출 방식
    const script = `
      (function(){
        try {
          var mainDef = cpr.core.Platform.INSTANCE.lookup("app/com/main/Index");
          var main = mainDef.getInstances()[0];
          if(main) {
             main.callAppMethod("doOpenMenuToMdi", "${item.executeId}");
          }
        } catch(e) { console.error(e); }
      })()
    `;

    try {
      await webview.executeJavaScript(script);
      isSearchOpen.value = false; 
    } catch (err) {
      console.error("[Vue] 실행 실패:", err);
    }
  };

  // [헬퍼] 데이터 가공
  function processMenuData(list) {
    const map = {};
    const result = [];
    list.forEach(item => { map[item.MENU_ID] = item; });

    Object.values(map).forEach(item => {
      // 실행 가능한 메뉴만
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

  // 전역 노출
  window.executeMenu = executeMenu;

  return { menuData, isSearchOpen, setupMenuListeners, openMenuSearch, executeMenu };
}