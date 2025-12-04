const { execSync } = require('child_process');

// 터미널에서 입력한 메시지 가져오기
const args = process.argv.slice(2);
const message = args.join(' ') || 'Auto Commit'; 

console.log(`🚀 [Git Push] 시작... 메시지: "${message}"`);

// 1. 버전 업데이트 (메시지가 버전 형식이면)
const versionMatch = message.match(/^v?(\d+\.\d+\.\d+)/);
if (versionMatch) {
  const version = versionMatch[1];
  console.log(`📦 [Version Update] 감지됨: ${version}`);
  try {
    // package.json 버전 변경 (git tag 생성 안 함)
    execSync(`npm version ${version} --no-git-tag-version`, { stdio: 'inherit' });
    console.log(`✅ package.json 버전이 ${version}으로 업데이트되었습니다.`);
  } catch (e) {
    console.warn(`⚠️ 버전 업데이트 실패 (이미 해당 버전이거나 오류 발생)`);
  }
}

try {
  // 2. Staging
  console.log('Running: git add .');
  execSync('git add .', { stdio: 'inherit' });

  // 3. Commit
  console.log(`Running: git commit -m "${message}"`);
  try {
    execSync(`git commit -m "${message}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️ 변경 사항이 없거나 커밋에 실패했습니다. (계속 진행)');
  }

  // 4. Push
  console.log('Running: git push -u origin main');
  execSync('git push -u origin main', { stdio: 'inherit' });
  
  console.log('✅ [Git Push] 성공적으로 완료되었습니다!');
} catch (error) {
  console.error('❌ [Git Push] 실패:', error.message);
  process.exit(1);
}