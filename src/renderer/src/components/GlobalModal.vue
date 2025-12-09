<template>
  <div v-if="modalState.isVisible" class="global-modal-overlay" @click.self="handleOverlayClick">
    <div class="global-modal-content">
      
      <div class="modal-header">
        <span class="icon">{{ modalIcon }}</span>
        <span class="title">{{ modalState.title || '알림' }}</span>
      </div>

      <div class="modal-body">
        <p>{{ modalState.message }}</p>
      </div>

      <div class="modal-footer">
        <button 
          v-if="modalState.type === 'confirm'" 
          class="btn-cancel" 
          @click="onCancel"
          tabindex="0"
        >
          {{ modalState.cancelText }}
        </button>

        <button 
          class="btn-ok" 
          ref="okButtonRef"
          @click="onOk"
          @keydown.enter="onOk"
          tabindex="0"
        >
          {{ modalState.okText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useModal } from '../composables/useModal';

const { modalState, handleAction } = useModal();
const okButtonRef = ref(null);

// 아이콘 결정 (단순 텍스트 이모지 사용)
const modalIcon = computed(() => {
  return modalState.type === 'confirm' ? '🤔' : '💡';
});

// 확인 버튼 클릭
const onOk = () => {
  handleAction(true);
};

// 취소 버튼 클릭
const onCancel = () => {
  handleAction(false);
};

// 배경 클릭 시 처리 (Confirm이면 취소 취급, Alert면 닫기 취급)
const handleOverlayClick = () => {
  if (modalState.type === 'confirm') onCancel();
  else onOk();
};

// 키보드 이벤트 핸들링 (전역 ESC 등)
const handleKeydown = (e) => {
  if (!modalState.isVisible) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    // ESC 누르면 '취소'로 처리
    handleAction(false); 
  }
};

// 모달이 열리면 자동으로 '확인' 버튼에 포커스 (엔터 치면 바로 넘어가도록)
watch(() => modalState.isVisible, async (visible) => {
  if (visible) {
    await nextTick();
    if (okButtonRef.value) okButtonRef.value.focus();
  }
});

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true); // 캡처링 단계에서 가로챔
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true);
});
</script>

<style scoped>
.global-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  /* 최상위 z-index: 다른 어떤 모달보다 위에 뜸 */
  z-index: 999999;
  
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px); /* 배경 흐림 효과 */
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* 애니메이션 */
  animation: fadeIn 0.2s ease-out;
}

.global-modal-content {
  background: white;
  min-width: 320px;
  max-width: 450px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  padding: 25px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  
  /* 팝업 애니메이션 */
  transform: scale(0.95);
  animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.modal-header .icon { font-size: 24px; }
.modal-header .title { font-size: 18px; font-weight: bold; color: #333; }

.modal-body p {
  margin: 0;
  font-size: 15px;
  color: #555;
  line-height: 1.6;
  white-space: pre-wrap; /* 줄바꿈 문자(\n) 지원 */
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

button {
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

/* 취소 버튼 스타일 */
.btn-cancel {
  background: #f1f3f5;
  color: #495057;
}
.btn-cancel:hover { background: #e9ecef; }

/* 확인 버튼 스타일 */
.btn-ok {
  background: #3498db;
  color: white;
}
.btn-ok:hover { background: #2980b9; }
.btn-ok:focus { 
  outline: 2px solid #3498db; 
  outline-offset: 2px; 
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { to { transform: scale(1); } }
</style>