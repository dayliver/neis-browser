<template>
  <div class="search-overlay" @click.self="closeModal">
    <div class="search-container">
      
      <div class="search-header">
        <span class="icon">🔍</span>
        <input 
          ref="inputRef"
          :value="query"
          @input="onInput"
          type="text" 
          placeholder="메뉴명 검색 (↑↓ 이동, Enter 실행)" 
          @keydown="onInputKeydown"
          autofocus
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
            <div class="name-row">
              <span class="item-name" v-html="highlight(item.name)"></span>
              <!-- 키워드로 검색된 경우 뱃지 표시 -->
              <span v-if="isKeywordMatch(item)" class="badge-keyword">#{{ currentSearchQuery }}</span>
              <span v-if="item.count > 0" class="badge-count">🔥 {{ item.count }}</span>
            </div>
          </div>
          <span class="enter-hint" v-if="index === focusIndex">↵</span>
        </li>
      </ul>
      
      <div class="no-result" v-else>
        {{ query ? '검색 결과가 없습니다.' : '검색어를 입력하세요.' }}
        <!-- 한글 변환 검색 결과임을 알림 -->
        <div v-if="isConvertedSearch" class="kor-hint">
           <strong>'{{ koreanQuery }}'</strong>(으)로 변환하여 검색했습니다.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { engToKor } from '../utils/hangul';

const props = defineProps(['menuList']);
const emit = defineEmits(['close', 'execute']);

const query = ref('');
const inputRef = ref(null);
const listRef = ref(null);
const itemRefs = ref([]);
const focusIndex = ref(0);

// 실제로 검색에 사용된 쿼리 (영문 그대로 or 한글 변환됨)
const currentSearchQuery = ref('');
// 한글 변환 검색이 수행되었는지 여부
const isConvertedSearch = ref(false);

// 데이터 정규화 (배열 보장)
const normalizedMenuList = computed(() => {
    if (!props.menuList) return [];
    if (Array.isArray(props.menuList)) return props.menuList;
    return [];
});

const onInput = (e) => {
  query.value = e.target.value;
  focusIndex.value = 0; 
};

// 영타 -> 한글 자동 변환 쿼리
const koreanQuery = computed(() => {
    if (!query.value) return '';
    // 영어만 포함된 경우에만 변환 시도
    if (/^[a-zA-Z\s]+$/.test(query.value)) {
        return engToKor(query.value);
    }
    return '';
});

// ★ [수정] 검색 로직 변경: 1차(원본) -> 실패 시 2차(한글변환)
const filteredList = computed(() => {
  const listToFilter = normalizedMenuList.value;

  // 검색어 없을 때: 실행 횟수 순 정렬
  if (!query.value) {
      isConvertedSearch.value = false;
      currentSearchQuery.value = '';
      return [...listToFilter].sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  const q = query.value.toLowerCase();
  
  // 1. 원본 쿼리로 먼저 검색
  let filtered = listToFilter.filter(item => {
    const name = (item.name || '').toLowerCase();
    const path = (item.path || '').toLowerCase();
    const keywords = (item.keywords || '').toLowerCase();
    return name.includes(q) || path.includes(q) || keywords.includes(q);
  });

  // 2. 결과가 없고, 한글 변환이 가능한 경우 -> 한글로 재검색
  if (filtered.length === 0 && koreanQuery.value && koreanQuery.value !== query.value) {
      const kq = koreanQuery.value;
      filtered = listToFilter.filter(item => {
        const name = (item.name || '').toLowerCase();
        const path = (item.path || '').toLowerCase();
        const keywords = (item.keywords || '').toLowerCase();
        return name.includes(kq) || path.includes(kq) || keywords.includes(kq);
      });
      
      if (filtered.length > 0) {
          isConvertedSearch.value = true;
          currentSearchQuery.value = kq;
      } else {
          isConvertedSearch.value = false;
          currentSearchQuery.value = q;
      }
  } else {
      isConvertedSearch.value = false;
      currentSearchQuery.value = q;
  }

  // 3. 점수 기반 정렬 (Scoring)
  // currentSearchQuery.value를 기준으로 점수 매김
  const targetQ = currentSearchQuery.value;

  return filtered.map(item => {
      let score = 0;
      const name = (item.name || '').toLowerCase();
      const keywords = (item.keywords || '').toLowerCase();
      
      // (1) 이름 정확도
      if (name === targetQ) score += 1000;          
      else if (name.startsWith(targetQ)) score += 500; 
      else if (name.includes(targetQ)) score += 100;   

      // (2) 키워드 정확도
      if (keywords.includes(targetQ)) score += 80;

      // (3) 실행 횟수 점수
      score += (item.count || 0) * 10;
      
      return { item, score };
  })
  .sort((a, b) => b.score - a.score) 
  .map(wrapper => wrapper.item);     
});

// 하이라이팅 로직 수정
const highlight = (text) => {
  if (!query.value || !text) return text;
  try {
    // 현재 검색에 성공한 쿼리(currentSearchQuery)로 하이라이팅
    const targetQ = currentSearchQuery.value || query.value;
    const escapedQuery = targetQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<span class="highlight">$1</span>');
  } catch (e) { return text; }
};

// 키워드 매칭 여부 확인 헬퍼
const isKeywordMatch = (item) => {
    const q = currentSearchQuery.value;
    return q && item.keywords && item.keywords.includes(q);
};

watch(focusIndex, (idx) => {
  nextTick(() => {
    const el = itemRefs.value[idx];
    if (el && listRef.value) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
});

const onInputKeydown = (e) => {
  const len = Math.min(filteredList.value.length, 100);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (len > 0) focusIndex.value = (focusIndex.value + 1) % len;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (len > 0) focusIndex.value = (focusIndex.value - 1 + len) % len;
  } else if (e.key === 'Enter') {
    if (e.isComposing) return;
    e.preventDefault();
    if (len > 0) execute(filteredList.value[focusIndex.value]);
  } else if (e.key === 'Escape') {
    closeModal();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (len > 0) itemRefs.value[focusIndex.value]?.focus();
  }
};

const onListKeydown = (e, item) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    execute(item);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    inputRef.value?.focus();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    onInputKeydown(e);
    nextTick(() => itemRefs.value[focusIndex.value]?.focus());
  } else if (e.key.length === 1) {
      inputRef.value?.focus();
  }
};

const onClickItem = (item) => {
  execute(item);
};

const execute = (item) => {
  emit('execute', item.id); 
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
  background: rgba(0,0,0,0.4); backdrop-filter: blur(3px);
  display: flex; justify-content: center; padding-top: 80px; z-index: 99999;
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
  ime-mode: active; 
}
.search-header .count {
  font-size: 12px; color: #666; background: #f1f3f5; padding: 4px 8px; border-radius: 12px; font-weight: 600;
}
.result-list {
  list-style: none; padding: 0; margin: 0; overflow-y: auto;
}
.result-list li {
  padding: 10px 20px; cursor: pointer; border-bottom: 1px solid #f9f9f9;
  display: flex; justify-content: space-between; align-items: center;
}
.result-list li.active { background: #e8f0fe; }
.item-content { flex: 1; min-width: 0; }
.item-path { font-size: 11px; color: #888; margin-bottom: 2px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name-row { display: flex; align-items: center; gap: 6px; }
.item-name { font-size: 14px; font-weight: bold; color: #333; }
.badge-count { font-size: 11px; color: #e67e22; background: #fff3e0; padding: 1px 5px; border-radius: 4px; font-weight: bold; }
.badge-keyword { font-size: 11px; color: #888; background: #f0f0f0; padding: 1px 5px; border-radius: 4px; }

/* 한글 변환 힌트 스타일 */
.kor-hint { margin-top: 10px; font-size: 13px; color: #666; }
.kor-hint strong { color: #1a73e8; }

:deep(.highlight) { color: #1a73e8; text-decoration: underline; }
.enter-hint { font-size: 12px; opacity: 0.7; }
.no-result { padding: 30px; text-align: center; color: #999; }
</style>