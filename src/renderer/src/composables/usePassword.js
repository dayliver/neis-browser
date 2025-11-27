import { ref, onMounted, onUnmounted } from 'vue';

export function usePassword(getActiveWebview) {
  const showLoginModal = ref(false);
  const loginForm = ref({ id: '', password: '' });

  // 저장된 비밀번호 로드
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

  // 비밀번호 저장
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

  // ★ [핵심] 하드웨어 타이핑 로직 (IPC 리스너)
  const setupPasswordListeners = () => {
    if (!window.electron?.ipcRenderer) return;

    // 핸들러 정의
    const handleTypeRequest = async () => {
      console.log('[Logic] 타이핑 요청 수신 -> 작업 시작');
      const webview = getActiveWebview();
      
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

    // 리스너 등록
    window.electron.ipcRenderer.on('req-type-password-to-vue', handleTypeRequest);

    // 클린업 (컴포넌트 해제 시 리스너 제거)
    onUnmounted(() => {
      window.electron.ipcRenderer.removeAllListeners('req-type-password-to-vue');
    });
  };

  // 수동 실행 기능
  const executeAutoLogin = () => {
    // 수동 실행도 동일한 로직을 타게 하거나, 직접 호출
    const webview = getActiveWebview();
    if(webview) webview.send('req-type-password'); // Preload에게 요청해서 역으로 다시 받음 (흐름 통일)
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