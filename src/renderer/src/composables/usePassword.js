import { ref, onMounted, onUnmounted } from 'vue';

// ★★★ [핵심 수정] 함수 밖으로 뺐습니다 (전역 상태 공유) ★★★
// 이제 어디서 usePassword를 호출해도 이 변수들은 하나로 공유됩니다.
const showLoginModal = ref(false);
const loginForm = ref({ id: '', password: '' });

export function usePassword(getActiveWebview) {
  
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

  // 하드웨어 타이핑 로직 (IPC 리스너)
  const setupPasswordListeners = () => {
    if (!window.electron?.ipcRenderer) return;

    const handleTypeRequest = async () => {
      console.log('[Logic] 타이핑 요청 수신 -> 작업 시작');
      
      // getActiveWebview가 함수 인자로 넘어왔거나, 
      // 만약 undefined라면 외부에서 주입받아야 함.
      // 보통 usePassword를 호출할 때 넣어주므로 사용 가능.
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

    window.electron.ipcRenderer.on('req-type-password-to-vue', handleTypeRequest);

    onUnmounted(() => {
      window.electron.ipcRenderer.removeAllListeners('req-type-password-to-vue');
    });
  };

  // 수동 실행
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