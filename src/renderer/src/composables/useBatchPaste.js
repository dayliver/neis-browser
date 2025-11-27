// src/renderer/src/composables/useBatchPaste.js

import { useTabs } from './useTabs'; // 웹뷰 접근을 위해 필요

export function useBatchPaste() {
  const { getActiveWebview } = useTabs();

  // 텍스트 청소 (스마트 따옴표 등)
  const cleanText = (text) => {
    if (!text) return '';
    return text
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\u00A0/g, ' ')
      .trim();
  };

  // 실행 함수
  const runBatchPaste = async () => {
    const webview = getActiveWebview();
    if (!webview) return alert('활성화된 탭이 없습니다.');

    try {
      const clipboardItems = await navigator.clipboard.read();
      let dataList = [];
      let isHtml = false;

      // 1. HTML 포맷 우선 파싱 (표/엑셀 완벽 지원)
      for (const item of clipboardItems) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          const htmlText = await blob.text();
          
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');
          const rows = doc.querySelectorAll('tr');
          
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
              const cleaned = cleanText(cell.innerText);
              if (cleaned.length > 0) dataList.push(cleaned);
            });
          });
          
          isHtml = true;
          break;
        }
      }

      // 2. 텍스트 포맷 폴백
      if (!isHtml) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim() !== '') {
          dataList = text.split(/\r?\n/)
            .map(line => cleanText(line))
            .filter(line => line.length > 0);
        }
      }

      if (dataList.length === 0) return alert('붙여넣을 데이터가 없습니다.');

      // 3. 전송 확인
      const sourceName = isHtml ? '표(HTML) 서식' : '텍스트 서식';
      const preview = dataList[0].length > 20 ? dataList[0].substring(0, 20) + '...' : dataList[0];
      
      const msg = `[일괄 붙여넣기 준비]\n\n- 출처: ${sourceName}\n- 건수: ${dataList.length}개\n- 첫 내용: "${preview}"\n\n이 데이터를 입력하시겠습니까?`;

      if (confirm(msg)) {
        console.log(`[BatchPaste] 데이터 전송 (${dataList.length}건)`);
        webview.send('cmd-excel-data', dataList);
      }

    } catch (err) {
      // 권한 오류 시 텍스트만이라도 시도
      try {
        const text = await navigator.clipboard.readText();
        if(text && confirm('HTML 서식 읽기 실패. 일반 텍스트로 시도할까요?')) {
           const list = text.split(/\r?\n/).filter(l => l.trim());
           webview.send('cmd-excel-data', list);
        }
      } catch(e) {
        alert('클립보드 접근 오류: ' + err.message);
      }
    }
  };

  return {
    runBatchPaste
  };
}