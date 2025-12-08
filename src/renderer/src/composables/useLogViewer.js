import { ref } from 'vue';

// 상태를 함수 밖으로 빼서 전역 공유 (Singleton)
const showLogModal = ref(false);

export function useLogViewer() {
  const openLogViewer = () => {
    console.log('[useLogViewer] 모달 열기 요청');
    showLogModal.value = true;
  };

  const closeLogViewer = () => {
    showLogModal.value = false;
  };

  return {
    showLogModal,
    openLogViewer,
    closeLogViewer
  };
}