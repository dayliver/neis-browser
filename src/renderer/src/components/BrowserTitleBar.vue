<template>
  <div class="titlebar">
    <!-- 앱 아이콘 (파비콘) 추가 -->
    <div class="app-icon-wrapper">
      <img :src="appIcon" alt="App Icon" class="app-icon" />
    </div>

    <div class="tabs-container">
      <div 
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: currentTabId === tab.id }"
        @click="switchTab(tab.id)"
      >
        <!-- <span class="tab-icon">📄</span> -->
        <span class="tab-title">{{ tab.title }}</span>
        <span class="close-btn" @click.stop="closeTab(tab.id)">×</span>
      </div>
    </div>

    <div class="action-buttons">
      <ActionButton icon="rotate" emoji="🔄" label="새로고침" @click="refreshTab" />
      <ActionButton icon="search" label="메뉴 검색(F3 또는 Ctrl+F)" @click="openMenuSearch" />
      <ActionButton icon="lock" label="비밀번호 설정" @click="showLoginModal = true" />
      <ActionButton icon="location" label="지역변경" variant="danger" @click="goRegionSelect" />
      <ActionButton icon="log" label="로그 보기" @click="openLogViewer" />

      <!-- <ActionButton emoji="🐞" @click="openDevTools" /> -->
    </div>

    <div class="window-controls-spacer"></div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import ActionButton from './ActionButton.vue';
import appIcon from '../assets/icons/icon.png'; // 상대 경로로 import (경로는 실제 파일 위치에 맞게 조정 필요)

// Composables
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';
import { useMenuSearch } from '../composables/useMenuSearch';
import { useLogViewer } from '../composables/useLogViewer';

const router = useRouter();

// 로직 연결
const { tabs, currentTabId, switchTab, closeTab, getActiveWebview } = useTabs();
const { showLoginModal } = usePassword(getActiveWebview);
const { openMenuSearch } = useMenuSearch();
const { openLogViewer } = useLogViewer();

// 단순 UI 액션
const refreshTab = () => getActiveWebview()?.reload();
const openDevTools = () => getActiveWebview()?.openDevTools();
const goRegionSelect = () => {
  if(confirm('지역을 변경하시겠습니까?')) {
    localStorage.removeItem('user_region');
    router.push({ name: 'SelectRegion' });
  }
};
</script>

<style scoped>
/* ★★★ [중요] 탭 스타일을 여기로 옮겨야 깨지지 않습니다 ★★★ */
.titlebar {
  height: 45px;
  display: flex;
  align-items: flex-end; /* 탭이 바닥에 붙도록 */
  background: #dadada;
  padding-left: 10px; /* 왼쪽 여백 */
  -webkit-app-region: drag; /* 타이틀바 드래그 가능 */
  user-select: none;
  border-bottom: 1px solid #ccc;
}

/* 앱 아이콘 스타일 */
.app-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; /* 아이콘 영역 너비 */
  height: 100%; /* 타이틀바 높이만큼 */
  margin-right: 4px; /* 탭과의 간격 */
  -webkit-app-region: drag; /* 아이콘 영역도 드래그 가능하게 (필요시 no-drag로 변경) */
}

.app-icon {
  width: 16px; /* 아이콘 크기 */
  padding-top: 8px;
  object-fit: contain;
  /* 만약 아이콘 클릭 이벤트를 넣고 싶다면 cursor: pointer; 추가 */
}

.tabs-container {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1; /* 남은 공간 차지 (아이콘과 버튼 사이) */
  /* align-items: flex-end; 이미 부모에 설정됨 */
  padding-bottom: 0; /* 탭 하단 라인 맞춤 */
}
.tabs-container::-webkit-scrollbar { display: none; }

.tab-item {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  width: 180px;
  height: 36px; /* 탭 높이 */
  background: #dadada++;
  border-radius: 8px 8px 0 0;
  padding: 0 10px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
  border: 1px solid transparent;
  margin-bottom: -1px; /* border-bottom과 겹치게 하여 활성 탭 하단 라인 없애기 효과 */
}
.tab-item:hover { background: #ebebeb; }

.tab-item.active {
  background: #ffffff;
  color: #000;
  font-weight: 600;
  box-shadow: 0 0 5px rgba(0,0,0,0.1);
  border-color: #ccc;
  border-bottom-color: #fff; /* 하단 라인을 흰색으로 덮어씀 */
  z-index: 10;
  height: 37px; /* 활성 탭을 1px 높여서 더 강조 */
  margin-top: -1px; /* 위치 보정 */
}
/* 탭 하단 가림막 (보조) */
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: white;
}

.tab-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close-btn { margin-left: 8px; font-size: 14px; padding: 0 4px; border-radius: 50%; }
.close-btn:hover { background: #ff7675; color: white; }

.action-buttons {
  display: flex;
  align-items: center;
  margin-left: 10px;
  padding-bottom: 6px;
  -webkit-app-region: no-drag;
}
.window-controls-spacer { width: 140px; flex-shrink: 0; }
</style>