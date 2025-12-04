<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>🔑 인증서 암호 설정</h3>
      <p class="warning">저장해두면 클릭 시 자동 입력됩니다.</p>
      
      <div class="input-group">
        <label>비밀번호</label>
        <input 
          :value="form.password" 
          @input="$emit('update:password', $event.target.value)"
          type="password" 
          placeholder="입력" 
          @keyup.enter="$emit('save')" 
        />
      </div>

      <div class="input-group">
        <label>메모/힌트</label>
        <input 
          :value="form.id" 
          @input="$emit('update:id', $event.target.value)"
          type="text" 
          placeholder="예: 업무용" 
        />
      </div>
      
      <div class="modal-actions">
        <button @click="$emit('save')" class="save-btn">저장</button>
        <button @click="$emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps(['form']);
defineEmits(['update:id', 'update:password', 'save', 'close']);
</script>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; justify-content: center; align-items: center; z-index: 99999; }
.modal-content { background: white; padding: 25px; border-radius: 12px; width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
.warning { font-size: 12px; color: #e74c3c; margin-bottom: 15px; }
.input-group { margin-bottom: 15px; }
.input-group label { display: block; font-size: 12px; margin-bottom: 5px; color: #555; }
.input-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.save-btn { background: #42b983; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
</style>