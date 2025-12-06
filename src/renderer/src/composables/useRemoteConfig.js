import { ref } from 'vue';

// ★ [설정] 실제 Gist Raw URL
const CONFIG_URL = 'https://gist.githubusercontent.com/dayliver/b654acc0dbb426a30728ecd2735fe2ed/raw/config.json'; 
const STORAGE_KEY_SCRIPTS = 'cached_remote_scripts_v1';

// 상태 정의 (스크립트 초기값은 null)
const defaultConfig = {
  version: "0.0.0",
  app: { latestVersion: "0.0.0", updateUrl: "", status: "active", statusMessage: "" },
  features: { enablePaste: true, enableSearch: true },
  notice: { id: 0, show: false, title: "", content: "", type: "info", link: "" },
  decodedScripts: null // ★ 하드코딩 제거: 초기값 null
};

const config = ref({ ...defaultConfig });
const isOffline = ref(false);

// 헬퍼: Base64 -> Object 디코딩
const decodeScripts = (base64Code) => {
  try {
    const decodedString = decodeURIComponent(escape(window.atob(base64Code)));
    return JSON.parse(decodedString);
  } catch (e) {
    console.error('[RemoteConfig] 스크립트 디코딩 오류:', e);
    return null;
  }
};

export function useRemoteConfig() {
  
  const fetchConfig = async () => {
    // 1. [Cache] 로컬 스토리지 캐시 시도 (기존 사용자 배려)
    try {
      const cached = localStorage.getItem(STORAGE_KEY_SCRIPTS);
      if (cached) {
        const cachedScripts = JSON.parse(cached);
        const decoded = decodeScripts(cachedScripts.code);
        if (decoded) {
          console.log(`[RemoteConfig] 캐시된 스크립트 로드 (v${cachedScripts.version})`);
          config.value.decodedScripts = decoded;
        }
      }
    } catch (e) { console.warn('[RemoteConfig] 캐시 로드 실패:', e); }

    // 2. [Network] 최신 설정 요청
    try {
      const response = await fetch(`${CONFIG_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`Config fetch failed: ${response.status}`);
      
      const data = await response.json();
      
      // 설정 병합
      config.value = {
        ...defaultConfig,
        ...data,
        app: { ...defaultConfig.app, ...data.app },
        features: { ...defaultConfig.features, ...data.features },
        notice: { ...defaultConfig.notice, ...data.notice },
        // 스크립트는 아래 로직으로 처리
        decodedScripts: config.value.decodedScripts 
      };

      // 3. [Update] 스크립트 갱신 및 캐싱
      if (data.scripts && data.scripts.code) {
        const newDecoded = decodeScripts(data.scripts.code);
        if (newDecoded) {
          config.value.decodedScripts = newDecoded;
          localStorage.setItem(STORAGE_KEY_SCRIPTS, JSON.stringify(data.scripts));
          console.log(`[RemoteConfig] 스크립트 업데이트 완료 (v${data.scripts.version})`);
        }
      }

      isOffline.value = false;
      
      // 기능 플래그 전파
      const featuresPayload = JSON.parse(JSON.stringify(config.value.features));
      window.postMessage({ type: 'UPDATE_FEATURE_FLAGS', payload: featuresPayload }, '*');

      return config.value;

    } catch (e) {
      console.warn('[RemoteConfig] 설정 로드 실패 (오프라인):', e);
      isOffline.value = true;
      return config.value;
    }
  };

  const checkNotice = () => {
    const notice = config.value.notice;
    if (!notice || !notice.show) return null;
    const lastReadId = Number(localStorage.getItem('last_read_notice_id') || 0);
    if (notice.id > lastReadId) return notice;
    return null;
  };

  const markNoticeAsRead = (noticeId) => {
    if (!noticeId) return;
    localStorage.setItem('last_read_notice_id', String(noticeId));
  };

  const checkAppStatus = (currentVersion) => {
    const { app, decodedScripts } = config.value;

    // ★ [보안 강화] 필수 스크립트가 없으면 실행 불가 (첫 실행 오프라인 등)
    if (!decodedScripts) {
        return { 
            type: 'block', 
            message: "초기 설정을 불러올 수 없습니다.\n인터넷 연결을 확인하고 다시 실행해주세요." 
        };
    }

    // 오프라인이지만 캐시된 스크립트가 있는 경우 -> 경고만 띄우고 실행 허용
    if (isOffline.value) {
        return { 
            type: 'offline', 
            message: "서버와 연결할 수 없습니다.\n마지막으로 저장된 설정을 사용합니다." 
        };
    }

    if (app.status === 'requireUpdate') {
        if (app.latestVersion > currentVersion) {
            return { type: 'update', message: app.statusMessage || "보안 업데이트가 필요합니다.", url: app.updateUrl };
        } else {
            return { type: 'normal' };
        }
    }
    
    if (app.status !== 'active' && app.status !== 'requireUpdate') {
      return { type: 'block', message: app.statusMessage || "서비스 점검 중입니다.", status: app.status };
    }

    return { type: 'normal' };
  };

  return { config, fetchConfig, checkNotice, markNoticeAsRead, checkAppStatus };
}