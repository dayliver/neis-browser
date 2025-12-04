<template>
  <div id="app-container">
    <!-- 0. 로딩 화면 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
    </div>

    <!-- 1. 앱 완전 차단 (shutdown) -->
    <div v-else-if="appStatus.type === 'block'" class="block-overlay">
      <div class="block-content">
        <div class="icon">🚫</div>
        <h2>서비스 이용 불가</h2>
        <p style="white-space: pre-line">{{ appStatus.message }}</p>
        <button @click="closeApp">앱 종료</button>
      </div>
    </div>

    <!-- 2. 강제 업데이트 -->
    <div v-else-if="appStatus.type === 'update'" class="block-overlay">
      <div class="block-content">
        <div class="icon">🚀</div>
        <h2>업데이트 필요</h2>
        <p style="white-space: pre-line">{{ appStatus.message }}</p>
        <button @click="goUpdate">업데이트 하러가기</button>
        <div style="margin-top:10px">
            <a href="#" @click.prevent="closeApp" style="color:#999; font-size:12px">나중에 하기 (앱 종료)</a>
        </div>
      </div>
    </div>

    <!-- 3. 정상 앱 화면 (라우터 뷰) -->
    <!-- warning 상태여도 일단 렌더링하고 위에 모달을 띄움 -->
    <router-view v-else></router-view>

    <!-- 4. [신규] 경고 모달 (maintenance, inactive 등) -->
    <!-- block-overlay와 비슷하지만 닫기 버튼이 있음 -->
    <div v-if="showWarningModal" class="block-overlay" style="background: rgba(0,0,0,0.7);">
      <div class="block-content">
        <div class="icon">⚠️</div>
        <h2>서비스 알림</h2>
        <p style="white-space: pre-line">{{ appStatus.message }}</p>
        <div class="button-group">
            <button @click="closeApp" style="background: #999; margin-right: 10px;">종료</button>
            <button @click="closeWarning">계속 사용하기</button>
        </div>
      </div>
    </div>

    <!-- 5. 일반 공지사항 모달 -->
    <div v-if="noticeData" class="notice-overlay">
      <div class="notice-content">
        <div class="notice-header">
          <h3>📢 {{ noticeData.title }}</h3>
        </div>
        <div class="notice-body">
          <p style="white-space: pre-wrap">{{ noticeData.content }}</p>
        </div>
        <div class="notice-footer">
          <div class="link-area">
             <a v-if="noticeData.link" :href="noticeData.link" target="_blank" @click.prevent="openLink(noticeData.link)">자세히 보기 ↗</a>
          </div>
          <button @click="closeNoticeModal">닫기 (다시 보지 않기)</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRemoteConfig } from './composables/useRemoteConfig';

const CURRENT_VERSION = "0.5.0"; 

const { fetchConfig, checkNotice, markNoticeAsRead, checkAppStatus } = useRemoteConfig();

const isLoading = ref(true);
const appStatus = ref({ type: 'normal' });
const noticeData = ref(null);
const showWarningModal = ref(false); // 경고 모달 표시 여부

const closeApp = () => window.close();
const goUpdate = () => {
    if (appStatus.value.url) window.open(appStatus.value.url);
};
const openLink = (url) => window.open(url);

const closeWarning = () => {
    showWarningModal.value = false;
    // 경고를 닫으면 그제서야 일반 공지사항 체크 시작
    checkAndShowNotice();
};

const closeNoticeModal = () => {
    if (noticeData.value) {
        markNoticeAsRead(noticeData.value.id);
        noticeData.value = null;
    }
};

const checkAndShowNotice = () => {
    const notice = checkNotice();
    if (notice) {
        // 약간의 딜레이를 주어 자연스럽게 등장
        setTimeout(() => {
            noticeData.value = notice;
        }, 300);
    }
};

onMounted(async () => {
  try {
    await fetchConfig();
    const status = checkAppStatus(CURRENT_VERSION);
    appStatus.value = status;

    // 상태별 처리
    if (status.type === 'normal') {
        checkAndShowNotice();
    } 
    else if (status.type === 'warning') {
        showWarningModal.value = true;
    }
    else if (status.type === 'offline') {
        // 오프라인일 때도 경고 모달 재활용
        appStatus.value.message = `[서버 연결 실패]\n${status.message}`;
        showWarningModal.value = true;
    }

  } catch (error) {
    console.error("App 초기화 중 오류:", error);
    appStatus.value = { type: 'offline', message: '초기화 중 오류가 발생했습니다.' };
    showWarningModal.value = true;
  } finally {
    isLoading.value = false;
  }
});
</script>

<style>
/* 전역 스타일 */
html, body, #app { 
  height: 100%; 
  margin: 0; 
  padding: 0; 
  overflow: hidden; 
  font-family: 'Malgun Gothic', sans-serif; 
  background: #dadada;
}

#app-container {
  height: 100%;
  width: 100%;
}

/* 차단/업데이트/경고 화면 스타일 */
.block-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: #dadada; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(3px); /* 배경 흐림 효과 */
}
.block-content {
  text-align: center; background: white; padding: 40px;
  border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  max-width: 400px;
  animation: popIn 0.3s ease-out;
}
@keyframes popIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.block-content .icon { font-size: 48px; margin-bottom: 20px; }
.block-content h2 { margin: 0 0 10px; color: #e74c3c; }
.block-content p { color: #555; line-height: 1.6; margin-bottom: 25px; }
.block-content button {
  padding: 10px 20px; background: #333; color: white; border: none;
  border-radius: 6px; cursor: pointer; font-size: 14px;
  transition: background 0.2s;
}
.block-content button:hover { background: #555; }
.button-group { display: flex; justify-content: center; }

/* 공지사항 모달 스타일 */
.notice-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5); z-index: 999990; 
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}
.notice-content {
  background: white; width: 400px; max-width: 90%;
  border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
}
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.notice-header {
  background: #3498db; color: white; padding: 15px 20px;
}
.notice-header h3 { margin: 0; font-size: 18px; }
.notice-body {
  padding: 20px; max-height: 300px; overflow-y: auto;
  font-size: 14px; line-height: 1.6; color: #333;
}
.notice-footer {
  padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #eee;
  display: flex; justify-content: space-between; align-items: center;
}
.notice-footer .link-area a {
  color: #3498db; text-decoration: none; font-size: 13px;
}
.notice-footer .link-area a:hover { text-decoration: underline; }
.notice-footer button {
  padding: 8px 16px; background: #333; color: white; border: none;
  border-radius: 4px; cursor: pointer; font-size: 13px;
}
.notice-footer button:hover { background: #555; }

/* 로딩 화면 스타일 */
.loading-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: #ffffff; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
}
.spinner {
  width: 40px; height: 40px;
  border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>