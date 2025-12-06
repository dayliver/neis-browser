import { useRemoteConfig } from './useRemoteConfig';

export function useScriptExecutor() {
  const { config } = useRemoteConfig();

  /**
   * 원격 스크립트를 Webview에서 안전하게 실행하는 함수
   * @param {Object} webview - Electron Webview DOM Element
   * @param {string} scriptKey - 실행할 스크립트 키 (예: 'extractMenuData')
   * @param {Object|null} args - 스크립트에 전달할 파라미터 (없으면 null)
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  const runRemoteScript = async (webview, scriptKey, args = null) => {
    // 1. 실행 환경 점검
    if (!webview) {
      console.warn(`[Executor] Webview가 없습니다. (${scriptKey})`);
      return { success: false, error: 'Webview not found' };
    }

    if (!config.value.decodedScripts) {
      console.warn(`[Executor] 로드된 스크립트가 없습니다. (${scriptKey})`);
      return { success: false, error: 'Scripts not loaded' };
    }

    const scriptCode = config.value.decodedScripts[scriptKey];
    if (!scriptCode) {
      console.error(`[Executor] 키에 해당하는 스크립트가 없습니다: ${scriptKey}`);
      return { success: false, error: `Script '${scriptKey}' not found` };
    }

    // 2. 실행 코드 조립
    let finalCode = scriptCode;

    if (args) {
      // 인자가 있는 경우: "함수(인자)" 형태로 호출
      // JSON.stringify를 통해 JS 객체를 문자열로 안전하게 변환
      const safeArgs = JSON.stringify(args);
      finalCode = `(${scriptCode})(${safeArgs})`;
    } else {
      // 인자가 없는 경우: 그냥 실행 (이미 IIFE 형태라고 가정)
      finalCode = scriptCode;
    }

    // 3. 실행 및 결과 반환
    try {
      // executeJavaScript는 마지막 표현식의 결과를 Promise로 반환함
      const result = await webview.executeJavaScript(finalCode);
      return { success: true, result };
    } catch (err) {
      console.error(`[Executor] 실행 중 오류 발생 (${scriptKey}):`, err);
      return { success: false, error: err.message };
    }
  };

  return {
    runRemoteScript
  };
}