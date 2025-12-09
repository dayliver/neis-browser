import { reactive } from 'vue';

// [Singleton State]
// 앱 전체에서 공유되는 유일한 모달 상태입니다.
const modalState = reactive({
  isVisible: false,
  type: 'alert', // 'alert' | 'confirm'
  title: '',
  message: '',
  okText: '확인',
  cancelText: '취소',
  resolve: null, // Promise의 resolve 함수를 저장해둠
});

export function useModal() {
  
  /**
   * 모달을 초기화하고 닫습니다.
   */
  const _reset = () => {
    modalState.isVisible = false;
    modalState.title = '';
    modalState.message = '';
    modalState.resolve = null;
  };

  /**
   * 내부적으로 모달을 띄우고 Promise를 반환하는 함수
   */
  const _show = (type, title, message, okText = '확인', cancelText = '취소') => {
    // 기존에 떠 있는 모달이 있다면 닫고 새로 띄움 (혹은 큐잉 처리 가능하나 여기선 단순화)
    if (modalState.isVisible) _reset();

    return new Promise((resolve) => {
      modalState.type = type;
      modalState.title = title;
      modalState.message = message;
      modalState.okText = okText;
      modalState.cancelText = cancelText;
      modalState.resolve = resolve;
      modalState.isVisible = true;
    });
  };

  /**
   * [Public] 확인 창 (Yes/No)
   * @returns {Promise<boolean>} true: 확인, false: 취소
   */
  const confirm = (title, message, okText = '확인', cancelText = '취소') => {
    return _show('confirm', title, message, okText, cancelText);
  };

  /**
   * [Public] 알림 창 (Yes Only)
   * @returns {Promise<boolean>} 항상 true 반환
   */
  const alert = (title, message, okText = '확인') => {
    return _show('alert', title, message, okText);
  };

  /**
   * [UI Component용] 사용자가 버튼을 눌렀을 때 호출
   * @param {boolean} result 
   */
  const handleAction = (result) => {
    if (modalState.resolve) {
      modalState.resolve(result);
    }
    _reset();
  };

  return {
    modalState,
    confirm,
    alert,
    handleAction
  };
}