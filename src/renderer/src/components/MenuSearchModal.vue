<template>
  <div class="search-overlay" @click.self="closeModal">
    <div class="search-container">
      
      <div class="search-header">
        <span class="icon">🔍</span>
        <input 
          ref="inputRef"
          v-model="query" 
          type="text" 
          placeholder="메뉴명 검색 (↑↓ 이동, Enter 실행)" 
          @keydown="onInputKeydown"
        />
        <span class="count" v-if="filteredList.length > 0">{{ filteredList.length }}</span>
      </div>

      <ul class="result-list" ref="listRef" v-if="filteredList.length > 0">
        <li 
          v-for="(item, index) in filteredList.slice(0, 100)" 
          :key="item.id"
          :ref="(el) => itemRefs[index] = el"
          :class="{ active: index === focusIndex }"
          @click="onClickItem(item)"
          @mouseover="focusIndex = index"
          @keydown="onListKeydown($event, item)"
          tabindex="0"
        >
          <div class="item-content">
            <span class="item-path" v-html="highlight(item.path)"></span>
            <span class="item-name" v-html="highlight(item.name)"></span>
          </div>
          <span class="enter-hint" v-if="index === focusIndex">↵</span>
        </li>
      </ul>
      
      <div class="no-result" v-else>
        {{ query ? '검색 결과가 없습니다.' : '검색어를 입력하세요.' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';

const props = defineProps(['menuList']);
const emit = defineEmits(['close', 'execute']);

const query = ref('');
const inputRef = ref(null);
const listRef = ref(null);
const itemRefs = ref([]);
const focusIndex = ref(0);

// 검색 필터링
const filteredList = computed(() => {
  focusIndex.value = 0;
  if (!query.value) return props.menuList || [];
  const q = query.value.toLowerCase();
  return (props.menuList || []).filter(item => 
    item.name.toLowerCase().includes(q) || 
    item.path.toLowerCase().includes(q)
  );
});

const highlight = (text) => {
  if (!query.value) return text;
  return text.replace(new RegExp(`(${query.value})`, 'gi'), '<span class="highlight">$1</span>');
};

// [UX] 스크롤 자동 이동
watch(focusIndex, (idx) => {
  nextTick(() => {
    const el = itemRefs.value[idx];
    if (el && listRef.value) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
});

// [Event] 입력창 키보드 핸들러
const onInputKeydown = (e) => {
  const len = Math.min(filteredList.value.length, 100);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (len > 0) focusIndex.value = (focusIndex.value + 1) % len;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (len > 0) focusIndex.value = (focusIndex.value - 1 + len) % len;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (len > 0) execute(filteredList.value[focusIndex.value]);
  } else if (e.key === 'Escape') {
    closeModal();
  } else if (e.key === 'Tab') { // [UX] 탭 키로 리스트 이동
    e.preventDefault();
    if (len > 0) itemRefs.value[focusIndex.value]?.focus();
  }
};

// [Event] 리스트 키보드 핸들러
const onListKeydown = (e, item) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    execute(item);
  } else if (e.key === 'Tab') { // [UX] 탭 키로 입력창 복귀
    e.preventDefault();
    inputRef.value?.focus();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    // 화살표는 입력창 핸들러와 동일하게 동작 (포커스만 유지)
    onInputKeydown(e);
    nextTick(() => itemRefs.value[focusIndex.value]?.focus());
  } else if (e.key.length === 1) {
     inputRef.value?.focus(); // 글자 치면 입력창으로
  }
};

// [Event] 마우스 클릭
const onClickItem = (item) => {
  console.log('[Modal] 마우스 클릭됨:', item.name);
  execute(item);
};

// 실행 요청 (부모에게 전달)
const execute = (item) => {
  const targetId = item.executeId || item.id;
  console.log('[Modal] 실행 이벤트 발신(emit):', targetId);
  emit('execute', targetId);
  closeModal();
};

const closeModal = () => {
  emit('close');
};

onMounted(() => {
  nextTick(() => inputRef.value?.focus());
});
</script>

<style scoped>
.search-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5); display: flex; justify-content: center; padding-top: 80px; z-index: 9999;
}
.search-container {
  width: 650px; max-width: 90%; background: white; border-radius: 10px;
  box-shadow: 0 15px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; max-height: 600px;
}
.search-header {
  display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eee;
}
.search-header .icon { font-size: 20px; margin-right: 10px; opacity: 0.5; }
.search-header input {
  flex: 1; border: none; font-size: 16px; outline: none; background: transparent;
}
.result-list {
  list-style: none; padding: 0; margin: 0; overflow-y: auto;
}
.result-list li {
  padding: 10px 20px; cursor: pointer; border-bottom: 1px solid #f9f9f9;
  display: flex; justify-content: space-between; align-items: center;
}
.result-list li.active { background: #e8f0fe; }
.item-path { font-size: 11px; color: #888; margin-bottom: 2px; display: block; }
.item-name { font-size: 14px; font-weight: bold; color: #333; }
:deep(.highlight) { color: #1a73e8; text-decoration: underline; }
.no-result { padding: 30px; text-align: center; color: #999; }
</style>