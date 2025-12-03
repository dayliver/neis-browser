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
      <!-- <ActionButton icon="rotate" emoji="🔄" label="새로고침" @click="refreshTab" /> -->
      <ActionButton icon="search" emoji="🔍" label="메뉴 검색" @click="openMenuSearch" />
      <ActionButton icon="lock" emoji="🔑" label="비밀번호 설정" @click="showLoginModal = true" />
      <ActionButton icon="location" emoji="🚪" label="지역변경" variant="danger" @click="goRegionSelect" />
      <ActionButton emoji="🐞" label="디버그" @click="openDevTools" />
    </div>

    <div class="window-controls-spacer"></div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import ActionButton from './ActionButton.vue';

// Composables
import { useTabs } from '../composables/useTabs';
import { usePassword } from '../composables/usePassword';
import { useMenuSearch } from '../composables/useMenuSearch'; 

const router = useRouter();

// 로직 연결
const { tabs, currentTabId, switchTab, closeTab, getActiveWebview } = useTabs();
const { showLoginModal } = usePassword(getActiveWebview);
const { openMenuSearch } = useMenuSearch();

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
  align-items: flex-end;
  background: #f3f3f3;
  padding-left: 10px;
  -webkit-app-region: drag;
  user-select: none;
  border-bottom: 1px solid #ccc;
}

.tabs-container {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-container::-webkit-scrollbar { display: none; }

.tab-item {
  -webkit-app-region: no-drag;
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
  border: 1px solid transparent;
}
.tab-item:hover { background: #ebebeb; }

.tab-item.active {
  background: #ffffff;
  color: #000;
  font-weight: 600;
  box-shadow: 0 0 5px rgba(0,0,0,0.1);
  border-color: #ccc;
  border-bottom-color: #fff;
  z-index: 10;
}
/* 탭 하단 가림막 */
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