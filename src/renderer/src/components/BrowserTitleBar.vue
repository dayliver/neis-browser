<template>
  <div class="titlebar">
    
    <div class="tabs-container">
      <div 
        v-for="tab in tabs" 
        :key="tab.id"
        class="tab-item"
        :class="{ active: currentTabId === tab.id }"
        @click="switchTab(tab.id)"
      >
        <span class="tab-icon">📄</span>
        <span class="tab-title">{{ tab.title }}</span>
        <span class="close-btn" @click.stop="closeTab(tab.id)">×</span>
      </div>
    </div>

    <div class="action-buttons">
      <ActionButton emoji="📋" label="일괄 붙여넣기" @click="runBatchPaste" />
      <ActionButton emoji="🔄" label="새로고침" @click="refreshTab" />
      <ActionButton emoji="🐞" label="디버그" @click="openDevTools" />
      
      <ActionButton emoji="🔑" label="비밀번호 설정" @click="showLoginModal = true" />
      <ActionButton emoji="⚡" label="수동 입력" variant="primary" @click="executeAutoLogin" />
      
      <ActionButton emoji="🚪" label="지역변경" variant="danger" @click="goRegionSelect" />
    </div>

    <div class="window-controls-spacer"></div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import ActionButton from './ActionButton.vue';

// 로직 덩어리들(Composables) 가져오기
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';
import { useBatchPaste } from '../composables/useBatchPaste';

const router = useRouter();

// 1. 탭 관련
const { tabs, currentTabId, switchTab, closeTab, getActiveWebview } = useTabs();

// 2. 비밀번호 관련
const { showLoginModal, executeAutoLogin } = usePassword(getActiveWebview);

// 3. 일괄 붙여넣기 관련
const { runBatchPaste } = useBatchPaste();

// 4. 기타 UI 액션
const refreshTab = () => getActiveWebview()?.reload();
const openDevTools = () => getActiveWebview()?.openDevTools();

const goRegionSelect = () => {
  if(confirm('모든 탭이 닫힙니다. 지역을 변경하시겠습니까?')) {
    localStorage.removeItem('user_region');
    router.push({ name: 'SelectRegion' });
  }
};
</script>

<style scoped>
/* 타이틀바 스타일 (BrowserLayout에서 가져옴) */
.titlebar {
  height: 45px;
  display: flex;
  align-items: flex-end;
  background: #f3f3f3;
  padding-left: 10px;
  -webkit-app-region: drag; /* 드래그 필수 */
  user-select: none;
  border-bottom: 1px solid #ddd;
}

.tabs-container {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-container::-webkit-scrollbar { display: none; }

.tab-item {
  -webkit-app-region: no-drag; /* 클릭 허용 필수 */
  display: flex;
  align-items: center;
  width: 180px;
  height: 36px;
  background: #e0e0e0;
  border-radius: 8px 8px 0 0;
  padding: 0 10px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.tab-item:hover { background: #ebebeb; }
.tab-item.active {
  background: #ffffff;
  color: #000;
  font-weight: 600;
  box-shadow: 0 0 10px rgba(0,0,0,0.05);
  z-index: 1;
}
.tab-item.active::after {
  content: ''; position: absolute; bottom: -5px; left: 0; right: 0; height: 5px; background: white;
}
.tab-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close-btn { margin-left: 8px; font-size: 14px; border-radius: 50%; padding: 0 4px; }
.close-btn:hover { background: #ff7675; color: white; }

.action-buttons {
  display: flex;
  align-items: center;
  margin-left: 10px;
  padding-bottom: 6px;
  -webkit-app-region: no-drag; /* 클릭 허용 필수 */
}

.window-controls-spacer { width: 140px; flex-shrink: 0; }
</style>