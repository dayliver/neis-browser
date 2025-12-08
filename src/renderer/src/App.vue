<template>
  <div id="app-container">
    
    <div 
      v-if="isLoading" 
      class="startup-overlay"
    >
      <div class="mb-6 p-5 rounded-3xl shadow-xl shadow-blue-100/50 animate-bounce-slow">
        <img :src="logoSrc" alt="App Logo" class="w-20 h-20 object-contain" />
      </div>

      <h1 class="text-2xl font-bold text-gray-800 tracking-tight mb-2 font-malgun">
        나이스브라우저
      </h1>
      <p class="text-gray-500 text-xs mb-10 tracking-wide">
        NEIS 업무, 더 빠르고 똑똑하게
      </p>

      <div class="relative flex items-center justify-center">
        <div class="w-10 h-10 border-4 border-gray-200 rounded-full"></div>
        <div class="absolute w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
      
      <div class="absolute bottom-10 text-gray-400 text-[10px] tracking-wider">
        VER {{ CURRENT_VERSION }}
      </div>
    </div>
    <div v-else-if="appStatus.type === 'block'" class="block-overlay">
      <div class="block-content">
        <div class="icon">🚫</div>
        <h2>서비스 이용 불가</h2>
        <p style="white-space: pre-line">{{ appStatus.message }}</p>
        <button @click="closeApp">앱 종료</button>
      </div>
    </div>

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

    <router-view v-else></router-view>

    <div v-if="showWarningModal" class="block-overlay with-titlebar" style="background: rgba(0,0,0,0.7);">
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

    <div v-if="noticeData" class="notice-overlay with-titlebar">
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
import logoSrc from './assets/logo128x128.png'; // 경로 확인 필수!

const CURRENT_VERSION = __APP_VERSION__;

const { fetchConfig, checkNotice, markNoticeAsRead, checkAppStatus } = useRemoteConfig();

const isLoading = ref(true);
const appStatus = ref({ type: 'normal' });
const noticeData = ref(null);
const showWarningModal = ref(false);

const closeApp = () => window.close();
const goUpdate = () => { if (appStatus.value.url) window.open(appStatus.value.url); };
const openLink = (url) => window.open(url);

const closeWarning = () => {
    showWarningModal.value = false;
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
        setTimeout(() => { noticeData.value = notice; }, 300);
    }
};

onMounted(async () => {
  try {
    // await new Promise(resolve => setTimeout(resolve, 1500)); // 테스트용 딜레이
    await fetchConfig();
    const status = checkAppStatus(CURRENT_VERSION);
    appStatus.value = status;

    if (status.type === 'normal') checkAndShowNotice();
    else if (status.type === 'warning') showWarningModal.value = true;
    else if (status.type === 'offline') {
        appStatus.value.message = `[서버 연결 실패]\n${status.message}`;
        showWarningModal.value = true;
    }
  } catch (error) {
    console.error("App Init Error:", error);
    appStatus.value = { type: 'offline', message: '초기화 오류' };
    showWarningModal.value = true;
  } finally {
    isLoading.value = false;
  }
});
;
</script>

<style>
/* 전역 스타일 */
html, body, #app { 
  height: 100%; margin: 0; padding: 0; overflow: hidden; 
  font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
  background: #dadada;
}
#app-container { height: 100%; width: 100%; }

.font-malgun { font-family: 'Malgun Gothic', sans-serif; }

/* ★★★ [신규] 강제 중앙 정렬용 클래스 ★★★ */
/* Tailwind가 안 먹힐 때를 대비한 확실한 보험입니다 */
.startup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;   /* 뷰포트 전체 너비 */
  height: 100vh;  /* 뷰포트 전체 높이 */
  z-index: 9999;
  background-color: #dadada;
  
  /* Flexbox 강제 적용 */
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;     /* 가로 중앙 */
  justify-content: center !important; /* 세로 중앙 */
  
  user-select: none;
}

/* 로고 애니메이션 */
@keyframes bounce-slow {
  0%, 100% { transform: translateY(-3%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); }
  50% { transform: translateY(0); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
}
.animate-bounce-slow {
  animation: bounce-slow 3s infinite;
}

/* 기존 오버레이들 스타일 유지 */
.block-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: #dadada; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(3px); 
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

/* 공지사항 모달 등 나머지 CSS는 기존 유지 */
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
.block-overlay.with-titlebar,
.notice-overlay.with-titlebar {
  top: 45px; /* 타이틀바 높이 */
  height: calc(100% - 45px); /* 남은 공간만 차지 */
}
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.notice-header { background: #3498db; color: white; padding: 15px 20px; }
.notice-header h3 { margin: 0; font-size: 18px; }
.notice-body { padding: 20px; max-height: 300px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #333; }
.notice-footer { padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
.notice-footer .link-area a { color: #3498db; text-decoration: none; font-size: 13px; }
.notice-footer .link-area a:hover { text-decoration: underline; }
.notice-footer button { padding: 8px 16px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
.notice-footer button:hover { background: #555; }
</style>