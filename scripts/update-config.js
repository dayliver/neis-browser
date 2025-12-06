require('dotenv').config();
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');
const pako = require('pako'); // npm install pako 필요

// 1. 환경 변수 확인
const GIST_ID = process.env.GIST_ID || 'b654acc0dbb426a30728ecd2735fe2ed';
const GH_TOKEN = process.env.GH_TOKEN;
const SECRET_KEY = 'https://neisbrowser.hwaryong.com'; // 빌드 스크립트에서는 평문 써도 무관 (배포 안 되므로)

if (!GH_TOKEN) {
  console.error('❌ [Error] GH_TOKEN이 .env 파일에 없습니다.');
  process.exit(1);
}

// 2. 주입할 스크립트 로드
const scriptsPath = path.join(__dirname, 'injectScripts.js');
const scriptsObj = require(scriptsPath);

console.log('🚀 [Config Update] 시작 (Compression + Encryption)...');

try {
  // (1) JSON 변환
  const jsonString = JSON.stringify(scriptsObj);
  
  // (2) Gzip 압축 (pako) -> Uint8Array 결과 나옴
  const compressed = pako.gzip(jsonString);

  // (3) 바이너리(Uint8Array)를 Base64 문자열로 1차 변환 (CryptoJS 입력용)
  // Node.js Buffer를 이용하면 편함
  const compressedBase64 = Buffer.from(compressed).toString('base64');

  // (4) AES 암호화
  const encrypted = CryptoJS.AES.encrypt(compressedBase64, SECRET_KEY).toString();

  // 버전 생성
  const now = new Date();
  const newVersion = Number(
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0')
  );

  console.log(`📦 생성된 버전: ${newVersion}`);
  console.log(`🔒 암호화된 데이터 길이: ${encrypted.length} chars`);
  
  updateGist(encrypted, newVersion);

} catch (e) {
  console.error('❌ 스크립트 처리 실패:', e);
  process.exit(1);
}

// Gist 업데이트 함수 (기존과 동일)
async function updateGist(newEncryptedCode, newVersionCode) {
  try {
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
    
    let config = JSON.parse(currentFile.content);

    // 데이터 업데이트
    config.scripts = {
      version: newVersionCode,
      code: newEncryptedCode // 이제 Base64가 아니라 암호문이 들어갑니다.
    };

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
          'config.json': { content: JSON.stringify(config, null, 2) }
        }
      })
    });

    if (!updateRes.ok) throw new Error(`Gist 업데이트 실패: ${updateRes.status}`);
    console.log('✅ [Success] config.json 업데이트 완료!');

  } catch (error) {
    console.error('❌ Gist 통신 중 오류:', error.message);
    process.exit(1);
  }
}