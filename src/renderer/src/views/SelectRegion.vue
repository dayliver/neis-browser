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

    <!-- [신규] 비밀번호 설정 모달 (지역 선택 후 표시) -->
    <LoginModal 
      v-if="showPasswordModal"
      :form="passwordForm"
      @update:id="passwordForm.id = $event"
      @update:password="passwordForm.password = $event"
      @save="savePasswordAndGo"
      @close="skipPasswordAndGo"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import LoginModal from '../components/LoginModal.vue';

const router = useRouter();
const showPasswordModal = ref(false);
const selectedRegionData = ref(null);

const passwordForm = ref({
  id: '',
  password: ''
});

const regions = [
  { name: '인천광역시', code: 'ice', url: 'https://ice.eduptl.kr' },
  { name: '서울특별시', code: 'sen', url: 'https://sen.eduptl.kr' },
  { name: '경기도', code: 'goe', url: 'https://goe.eduptl.kr' },
  { name: '강원특별자치도', code: 'kwe', url: 'https://kwe.eduptl.kr' },

  { name: '충청남도', code: 'cne', url: 'https://cne.eduptl.kr' },
  { name: '대전광역시', code: 'dje', url: 'https://dje.eduptl.kr' },
  { name: '세종특별자치시', code: 'sje', url: 'https://sje.eduptl.kr' },
  { name: '충청북도', code: 'cbe', url: 'https://cbe.eduptl.kr' },

  { name: '전북특별자치도', code: 'jbe', url: 'https://jbe.eduptl.kr' },
  { name: '경상북도', code: 'gbe', url: 'https://gbe.eduptl.kr' },
  { name: '대구광역시', code: 'dge', url: 'https://dge.eduptl.kr' },
  { name: '울산광역시', code: 'use', url: 'https://use.eduptl.kr' },
  
  { name: '전라남도', code: 'jne', url: 'https://jne.eduptl.kr' },
  { name: '광주광역시', code: 'gen', url: 'https://gen.eduptl.kr' },
  { name: '경상남도', code: 'gne', url: 'https://gne.eduptl.kr' },
  { name: '부산광역시', code: 'pen', url: 'https://pen.eduptl.kr' },
  
  { name: '제주특별자치도', code: 'jje', url: 'https://jje.eduptl.kr' },
];

// 1. 지역 선택 시 모달 띄우기
const selectRegion = (region) => {
  selectedRegionData.value = region;
  // 바로 저장하지 않고 임시 보관 후 모달 표시
  showPasswordModal.value = true;
};

// 2. 비밀번호 저장 후 이동
const savePasswordAndGo = () => {
  // 지역 정보 저장
  if (selectedRegionData.value) {
    localStorage.setItem('user_region', JSON.stringify(selectedRegionData.value));
  }
  
  // 비밀번호 저장 (ipcRenderer 사용)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.send('req-save-password', {
        id: passwordForm.value.id,
        password: passwordForm.value.password
    });
  }

  completeSetup();
};

// 3. 비밀번호 건너뛰고 이동
const skipPasswordAndGo = () => {
  // 지역 정보 저장
  if (selectedRegionData.value) {
    localStorage.setItem('user_region', JSON.stringify(selectedRegionData.value));
  }
  completeSetup();
};

// 공통 완료 처리
const completeSetup = () => {
  showPasswordModal.value = false;
  router.push({ name: 'Browser' }); // 메인 브라우저 화면으로 이동
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

h1 { margin-bottom: 10px; color: #333; font-size: 1.5rem; }
p { margin-bottom: 30px; color: #666; }

.region-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); /* 카드 크기 조정 */
  gap: 15px;
  max-width: 800px;
  width: 100%;
  padding: 20px;
}

.region-card {
  opacity: 0.6;
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
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.region-card:hover {
  opacity: 1;
  transform: translateY(-3px);
  box-shadow: 0 8px 15px rgba(0,0,0,0.1);
  border-color: #3498db; /* 파란색 계열로 변경 (나이스브라우저 테마) */
}

.region-name { font-weight: bold; font-size: 1.1rem; color: #333; }
.region-code { color: #999; font-size: 0.8rem; margin-top: 5px; font-weight: 600; }
</style>