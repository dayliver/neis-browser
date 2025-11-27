<template>
  <button 
    class="action-button" 
    :class="variant" 
    :title="label"
    @click="handleClick"
  >
    <span class="emoji">{{ emoji }}</span>
    </button>
</template>

<script setup>
// Props 정의 (부모에게 받을 데이터)
const props = defineProps({
  emoji: { type: String, required: true },
  label: { type: String, default: '' }, // 툴팁 역할
  variant: { type: String, default: 'default' } // 'default', 'primary', 'danger'
});

// Emits 정의 (부모에게 보낼 신호)
const emit = defineEmits(['click']);

const handleClick = (e) => {
  emit('click', e); // 부모에게 "나 클릭됐어!" 알림
};
</script>

<style scoped>
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