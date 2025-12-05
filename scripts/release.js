require('dotenv').config(); // .env 파일 로드
const { execSync } = require('child_process');

// 환경 변수 확인
if (!process.env.GH_TOKEN) {
  console.error('❌ [Error] GH_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

console.log('🚀 [Release] 윈도우 배포 프로세스 시작...');

try {
  // 1. 빌드 및 배포 명령어 실행
  // stdio: 'inherit'을 사용하여 터미널에 진행 상황을 그대로 보여줍니다.
  execSync('npm run build && electron-builder --win --publish always', { stdio: 'inherit' });

  console.log('✅ [Release] 배포가 성공적으로 완료되었습니다!');
} catch (error) {
  console.error('❌ [Release] 배포 중 오류 발생');
  process.exit(1);
}