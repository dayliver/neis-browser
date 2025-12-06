require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 1. 환경 변수 확인
const GIST_ID = process.env.GIST_ID || 'b654acc0dbb426a30728ecd2735fe2ed';
const GH_TOKEN = process.env.GH_TOKEN;

if (!GH_TOKEN) {
  console.error('❌ [Error] GH_TOKEN이 .env 파일에 없습니다.');
  process.exit(1);
}

// 2. 주입할 스크립트 로드
const scriptsPath = path.join(__dirname, 'injectScripts.js');
const scriptsObj = require(scriptsPath);

console.log('🚀 [Config Update] 시작...');
console.log(`📂 원본 스크립트 파일: ${scriptsPath}`);

// 3. 스크립트 번들링 및 Base64 인코딩
try {
  // 스크립트 객체를 JSON 문자열로 변환
  const jsonString = JSON.stringify(scriptsObj);
  // Base64 인코딩
  const base64Code = Buffer.from(jsonString).toString('base64');
  
  // 버전 생성 (YYYYMMDDHHmm)
  const now = new Date();
  const newVersion = Number(
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0')
  );

  console.log(`📦 생성된 버전: ${newVersion}`);
  
  updateGist(base64Code, newVersion);

} catch (e) {
  console.error('❌ 스크립트 인코딩 실패:', e);
  process.exit(1);
}

// 4. Gist 업데이트 함수 (Node.js native fetch 사용)
async function updateGist(newBase64Code, newVersionCode) {
  try {
    // (1) 기존 Config 가져오기 (기존 설정 유지 위해)
    console.log('☁️  GitHub Gist에서 현재 설정 가져오는 중...');
    const getRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getRes.ok) throw new Error(`Gist 조회 실패: ${getRes.status}`);
    
    const gistData = await getRes.json();
    const currentFile = gistData.files['config.json'];
    
    if (!currentFile) throw new Error('config.json 파일이 Gist에 없습니다.');
    
    // 기존 JSON 파싱
    let config = JSON.parse(currentFile.content);

    // (2) 데이터 업데이트
    config.scripts = {
      version: newVersionCode,
      code: newBase64Code
    };

    // (3) Gist에 덮어쓰기 (PATCH)
    console.log('☁️  업데이트된 설정을 업로드하는 중...');
    const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          'config.json': {
            content: JSON.stringify(config, null, 2) // 들여쓰기 2칸
          }
        }
      })
    });

    if (!updateRes.ok) throw new Error(`Gist 업데이트 실패: ${updateRes.status}`);

    console.log('✅ [Success] config.json 업데이트 완료!');
    console.log(`🔗 Gist URL: ${gistData.html_url}`);

  } catch (error) {
    console.error('❌ Gist 통신 중 오류:', error.message);
    process.exit(1);
  }
}