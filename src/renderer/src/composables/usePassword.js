import { ref, onMounted, onUnmounted } from 'vue';

// 전역 상태 (Singleton)
const showLoginModal = ref(false);
const loginForm = ref({ id: '', password: '' });

export function usePassword(getActiveWebview) {
  
  // 1. 비밀번호 로드
  const loadSavedPassword = async () => {
    const savedLogin = localStorage.getItem('auto_login_info');
    if (savedLogin) {
      const parsed = JSON.parse(savedLogin);
      loginForm.value.id = parsed.id;
      if (parsed.encryptedPassword && window.electron?.ipcRenderer) {
        try {
          loginForm.value.password = await window.electron.ipcRenderer.decryptPassword(parsed.encryptedPassword);
          console.log('Logic: 비밀번호 로드 완료');
        } catch (e) { console.error(e); }
      }
    }
  };

  // 2. 비밀번호 저장
  const saveLoginInfo = async () => {
    if (!window.electron?.ipcRenderer) return;
    try {
      const encryptedPw = await window.electron.ipcRenderer.encryptPassword(loginForm.value.password);
      localStorage.setItem('auto_login_info', JSON.stringify({
        id: loginForm.value.id,
        encryptedPassword: encryptedPw
      }));
      showLoginModal.value = false;
      alert('안전하게 저장되었습니다.');
    } catch (err) { alert(err.message); }
  };

  // 3. 타이핑 핸들러 (함수로 분리)
  const handleTypeRequest = async () => {
    console.log('[Logic] 타이핑 요청 수신 -> 작업 시작');
    
    // 주입받은 함수로 웹뷰 객체 가져오기
    const webview = getActiveWebview ? getActiveWebview() : null;
    
    if (loginForm.value.password && webview) {
      webview.focus();
      const password = loginForm.value.password;

      for (let i = 0; i < password.length; i++) {
        webview.sendInputEvent({ type: 'char', keyCode: password.charAt(i) });
        await new Promise(r => setTimeout(r, 50));
      }
      console.log('[Logic] 타이핑 완료');
    } else {
      console.warn('[Logic] 비밀번호 없음 or 웹뷰 없음');
    }
  };

  // 4. 리스너 등록 함수
  const setupPasswordListeners = () => {
    if (!window.electron?.ipcRenderer) return;
    
    // 기존 리스너 제거 후 등록 (중복 방지)
    window.electron.ipcRenderer.removeAllListeners('req-type-password-to-vue');
    window.electron.ipcRenderer.on('req-type-password-to-vue', handleTypeRequest);
  };

  // ★★★ [수정됨] 클린업은 함수 밖으로 꺼내서 즉시 등록해야 함 ★★★
  // usePassword()가 setup() 안에서 호출될 때 바로 실행되므로 안전함.
  onUnmounted(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.removeAllListeners('req-type-password-to-vue');
    }
  });

  // 5. 수동 실행
  const executeAutoLogin = () => {
    const webview = getActiveWebview ? getActiveWebview() : null;
    if(webview) webview.send('req-type-password');
  };

  return {
    showLoginModal,
    loginForm,
    loadSavedPassword,
    saveLoginInfo,
    setupPasswordListeners,
    executeAutoLogin
  };
}