<template>
  <div class="region-select-container">
    <h1>소속 시도교육청을 선택해주세요</h1>
    <p>선택하신 정보는 브라우저 설정에 저장됩니다.</p>
    
    <div class="region-grid">
      <button 
        v-for="region in regions" 
        :key="region.code" 
        class="region-card"
        @click="selectRegion(region)"
      >
        <div class="region-name">{{ region.name }}</div>
        <div class="region-code">{{ region.code.toUpperCase() }}</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { REGION_LIST } from '../constants/regions'; // 경로 확인 필요

const router = useRouter();
const regions = REGION_LIST;

const selectRegion = (regionData) => {
  // 1. 로컬 스토리지에 전체 객체 저장 (나중에 URL 필요하므로)
  localStorage.setItem('user_region', JSON.stringify(regionData));
  
  // 2. 메인 브라우저 화면으로 이동 (라우터 이름은 'Browser'로 가정)
  router.push({ name: 'Browser' });
};
</script>

<style scoped>
.region-select-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #dadada;
}

h1 { margin-bottom: 10px; color: #333; }
p { margin-bottom: 30px; color: #666; }

.region-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
  max-width: 800px;
  width: 100%;
  padding: 20px;
}

.region-card {
  opacity: 0.75;
  background: white;
  border: 1px solid #e1e4e8;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.region-card:hover {
  opacity: 1;
  transform: translateY(-3px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
  border-color: #42b983; /* Vue Green */
}

.region-name { font-weight: bold; font-size: 1.1rem; }
.region-code { color: #999; font-size: 0.8rem; margin-top: 5px; }
</style>