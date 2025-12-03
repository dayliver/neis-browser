<template>
  <div
    class="icon-wrapper"
    :class="variant" 
    :title="label"
    @click="handleClick"
  >
    <img 
      :src="iconSrc" 
      alt="" 
      class="icon-img"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
// Props 정의 (부모에게 받을 데이터)
const props = defineProps({
  icon: { type: String, default: '' },
  emoji: { type: String, required: true },
  label: { type: String, default: '' }, // 툴팁 역할
  variant: { type: String, default: 'default' } // 'default', 'primary', 'danger'
});

// Emits 정의 (부모에게 보낼 신호)
const emit = defineEmits(['click']);

const iconSrc = computed(() => {
  // 주의: 변수를 사용할 때는 템플릿 리터럴로 전체 경로를 명시해야 Vite가 정적으로 분석할 수 있습니다.
  // '../../../../public/icons/' 부분은 실제 public 폴더의 상대 경로에 맞춰 조정해야 할 수도 있지만,
  // Vite에서는 public 폴더를 import하는 대신 '/icons/...' 처럼 절대 경로로 쓰는 경우가 많습니다.
  // 하지만 빌드 이슈 해결을 위해 assets 폴더로 옮기는 것을 권장합니다.
  
  // [방법 1] public 폴더를 사용하는 경우 (base 경로 문제 해결 필요)
  // return `./icons/${props.icon}.svg`; // 상대 경로로 시도

  // [방법 2 - 권장] src/renderer/src/assets/icons 폴더로 아이콘을 옮기고 아래 방식 사용
  // 이 방식은 Vite가 빌드 시 파일 경로를 알아서 처리해줍니다.
  return new URL(`../assets/icons/${props.icon}.svg`, import.meta.url).href;
});


const handleClick = (e) => {
  emit('click', e); // 부모에게 "나 클릭됐어!" 알림
};
</script>

<style scoped>
.icon-wrapper {
  opacity: 0.35;
  margin: 4px 8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-wrapper:hover {
  opacity: 1;
}
.action-button {
  background: transparent;
  border: none;
  padding: 6px;
  margin-right: 4px;
  cursor: pointer;
  font-size: 16px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.action-button:hover { background: #e0e0e0; }

/* 변형 스타일 (Variant) */
.action-button.primary { color: #f1c40f; } /* 번개색 */
.action-button.primary:hover { background: #fff3cd; }

.action-button.danger { color: #e74c3c; } /* 위험색 */
.action-button.danger:hover { background: #ffcccc; }
</style>