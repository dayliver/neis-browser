import { ref } from 'vue';
import CryptoJS from 'crypto-js';
import pako from 'pako';

const CONFIG_URL = 'https://gist.githubusercontent.com/dayliver/b654acc0dbb426a30728ecd2735fe2ed/raw/config.json'; 
const STORAGE_KEY_SCRIPTS = 'cached_remote_scripts_v1'; // v1 유지 (구조 변경 대비)

// 난독화된 비밀번호 (Char Codes)
// "https://neisbrowser.hwaryong.com"
const _k = [104, 116, 116, 112, 115, 58, 47, 47, 110, 101, 105, 115, 98, 114, 111, 119, 115, 101, 114, 46, 104, 119, 97, 114, 121, 111, 110, 103, 46, 99, 111, 109];
const getSecret = () => String.fromCharCode(..._k);

const defaultConfig = {
  version: "0.0.0",
  app: { latestVersion: "0.0.0", updateUrl: "", status: "active", statusMessage: "" },
  features: { enablePaste: true, enableSearch: true },
  notice: { id: 0, show: false, title: "", content: "", type: "info", link: "" },
  decodedScripts: null
};

const config = ref({ ...defaultConfig });
const isOffline = ref(false);

// ★ 헬퍼: [암호문] -> AES 복호화 -> Base64 -> [Gzip 해제] -> JSON 파싱
const decodeScripts = (encryptedCode) => {
  try {
    if (!encryptedCode) return null;

    // 1. AES 복호화
    const secret = getSecret();
    const bytes = CryptoJS.AES.decrypt(encryptedCode, secret);
    const compressedBase64 = bytes.toString(CryptoJS.enc.Utf8);

    if (!compressedBase64) throw new Error('Decryption failed (Empty result)');

    // 2. Base64 -> Uint8Array (Binary) 변환
    // 브라우저 내장 atob 사용
    const binaryString = window.atob(compressedBase64);
    const len = binaryString.length;
    const bytesArray = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytesArray[i] = binaryString.charCodeAt(i);
    }

    // 3. Gzip 압축 해제 (Pako)
    const decompressed = pako.ungzip(bytesArray, { to: 'string' });

    // 4. JSON 파싱
    return JSON.parse(decompressed);

  } catch (e) {
    console.error('[RemoteConfig] 스크립트 복호화/압축해제 실패:', e);
    return null;
  }
};

export function useRemoteConfig() {
  
  const fetchConfig = async () => {
    // 1. [Cache] 로컬 스토리지 시도
    try {
      const cached = localStorage.getItem(STORAGE_KEY_SCRIPTS);
      if (cached) {
        const cachedObj = JSON.parse(cached);
        // 캐시된 데이터(encryptedCode)를 풀어본다
        const decoded = decodeScripts(cachedObj.code);
        if (decoded) {
          console.log(`[RemoteConfig] 캐시 로드 (v${cachedObj.version})`);
          config.value.decodedScripts = decoded;
        }
      }
    } catch (e) { console.warn('[RemoteConfig] 캐시 로드 실패:', e); }

    // 2. [Network] 최신 설정 요청
    try {
      const response = await fetch(`${CONFIG_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      
      const data = await response.json();
      
      config.value = {
        ...defaultConfig,
        ...data,
        app: { ...defaultConfig.app, ...data.app },
        features: { ...defaultConfig.features, ...data.features },
        notice: { ...defaultConfig.notice, ...data.notice },
        decodedScripts: config.value.decodedScripts 
      };

      // 3. [Update] 새 스크립트 처리
      if (data.scripts && data.scripts.code) {
        // 방금 받은 따끈따끈한 암호문을 풀어본다
        const newDecoded = decodeScripts(data.scripts.code);
        
        if (newDecoded) {
          config.value.decodedScripts = newDecoded;
          // 성공했다면 암호문 상태 그대로 캐싱 (다음에 풀어서 씀)
          localStorage.setItem(STORAGE_KEY_SCRIPTS, JSON.stringify(data.scripts));
          console.log(`[RemoteConfig] 업데이트 완료 (v${data.scripts.version})`);
        }
      }

      isOffline.value = false;
      const featuresPayload = JSON.parse(JSON.stringify(config.value.features));
      window.postMessage({ type: 'UPDATE_FEATURE_FLAGS', payload: featuresPayload }, '*');

      return config.value;

    } catch (e) {
      console.warn('[RemoteConfig] 오프라인:', e);
      isOffline.value = true;
      return config.value;
    }
  };

  const checkAppStatus = (currentVersion) => {
    const { app, decodedScripts } = config.value;

    // 보안 강화: 스크립트 로드 실패 시 차단
    if (!decodedScripts) {
        return { type: 'block', message: "보안 설정을 불러올 수 없습니다.\n인터넷 연결을 확인해주세요." };
    }

    if (isOffline.value) {
        return { type: 'offline', message: "오프라인 모드로 실행합니다." };
    }

    if (app.status === 'requireUpdate') {
        if (app.latestVersion > currentVersion) return { type: 'update', message: app.statusMessage, url: app.updateUrl };
        else return { type: 'normal' };
    }
    
    if (app.status !== 'active' && app.status !== 'requireUpdate') {
      return { type: 'block', message: app.statusMessage, status: app.status };
    }
    return { type: 'normal' };
  };
  
  // 나머지 checkNotice, markNoticeAsRead 는 기존과 동일하므로 생략하거나 그대로 유지
  const checkNotice = () => { /* ... */ return config.value.notice?.show ? config.value.notice : null; };
  const markNoticeAsRead = (id) => { /* ... */ };

  return { config, fetchConfig, checkNotice, markNoticeAsRead, checkAppStatus };
}