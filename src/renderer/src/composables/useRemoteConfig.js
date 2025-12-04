import { ref } from 'vue';

// ★ [설정] 실제 Gist Raw URL
const CONFIG_URL = 'https://gist.githubusercontent.com/dayliver/b654acc0dbb426a30728ecd2735fe2ed/raw/config.json'; 

const defaultConfig = {
  version: "0.0.0",
  app: {
    latestVersion: "0.0.0",
    updateUrl: "",
    // forceUpdate 제거, status로 통합
    status: "active", // active, maintenance, shutdown, requireUpdate
    statusMessage: ""
  },
  features: {
    enablePaste: true,
    enableSearch: true
  },
  notice: {
    id: 0,
    show: false,
    title: "",
    content: "",
    type: "info",
    link: ""
  }
};

const config = ref({ ...defaultConfig });
const isOffline = ref(false); // 통신 실패 여부

export function useRemoteConfig() {
  
  const fetchConfig = async () => {
    try {
      const response = await fetch(`${CONFIG_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`Config fetch failed: ${response.status}`);
      
      const data = await response.json();
      
      config.value = {
        ...defaultConfig,
        ...data,
        app: { ...defaultConfig.app, ...data.app },
        features: { ...defaultConfig.features, ...data.features },
        notice: { ...defaultConfig.notice, ...data.notice }
      };
      isOffline.value = false;

      // 기능 제어 신호 전송
      const featuresPayload = JSON.parse(JSON.stringify(config.value.features));
      window.postMessage({ type: 'UPDATE_FEATURE_FLAGS', payload: featuresPayload }, '*');

      console.log('[RemoteConfig] 설정 로드 완료', config.value);
      return config.value;

    } catch (e) {
      console.warn('[RemoteConfig] 로드 실패 (기본값 사용):', e);
      isOffline.value = true; // 실패 상태 기록
      return config.value; // 기본값 반환
    }
  };

  const checkNotice = () => {
    const notice = config.value.notice;
    if (!notice || !notice.show) return null;

    const lastReadId = Number(localStorage.getItem('last_read_notice_id') || 0);
    
    if (notice.id > lastReadId) {
      return notice;
    }
    return null;
  };

  const markNoticeAsRead = (noticeId) => {
    if (!noticeId) return;
    localStorage.setItem('last_read_notice_id', String(noticeId));
  };

  /**
   * 앱 상태 및 시나리오 판별
   * @param {string} currentVersion 현재 앱 버전
   */
  const checkAppStatus = (currentVersion) => {
    // 4. 서버 통신 실패 (오프라인/차단 등)
    if (isOffline.value) {
        return {
            type: 'offline',
            message: "서버와 연결할 수 없습니다.\n일부 기능이 제한될 수 있습니다."
        };
    }

    const { app } = config.value;

    // ★ [수정] status 기반 분기 처리
    
    // 1. 강제 업데이트 (requireUpdate)
    if (app.status === 'requireUpdate') {
        // 현재 버전이 최신 버전보다 낮으면 업데이트 모달 띄움
        if (app.latestVersion > currentVersion) {
            return {
                type: 'update',
                message: app.statusMessage || "중요한 보안 업데이트가 있습니다.\n계속하려면 업데이트를 진행해주세요.",
                url: app.updateUrl
            };
        } else {
            // 이미 최신 버전이라면 정상 이용 가능
            return { type: 'normal' };
        }
    }

    // 2. 서비스 차단 (shutdown, maintenance 등 active가 아닌 상태)
    // 위에서 requireUpdate인데 버전이 최신이라 통과한 경우도 여기서 걸러지지 않도록 주의 (active가 아니어도 requireUpdate면 이미 처리됨)
    if (app.status !== 'active' && app.status !== 'requireUpdate') {
      return {
        type: 'block',
        message: app.statusMessage || "서비스를 이용할 수 없습니다.",
        status: app.status
      };
    }

    // 3. 정상 (active)
    return { type: 'normal' };
  };

  return {
    config,
    fetchConfig,
    checkNotice,
    markNoticeAsRead,
    checkAppStatus
  };
}