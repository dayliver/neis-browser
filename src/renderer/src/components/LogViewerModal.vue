<template>
  <div class="log-overlay" @click.self="$emit('close')">
    
    <div class="log-window">
      
      <div class="log-header">
        <div class="header-left">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="title">SYSTEM LOG CONSOLE</span>
          <span class="badge">Last {{ (readSize / 1024).toFixed(0) }}KB</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="log-body">
        <div v-if="isLoading" class="status-msg">
          <div class="spinner"></div>
          <p>Reading log files...</p>
        </div>

        <div v-else-if="parsedLogs.length === 0" class="status-msg">
          No logs found.
        </div>

        <div v-else class="log-table">
          <div class="log-row header-row">
            <div class="col-time">TIMESTAMP</div>
            <div class="col-level">LEVEL</div>
            <div class="col-msg">MESSAGE</div>
          </div>

          <div 
            v-for="(log, index) in parsedLogs" 
            :key="index" 
            class="log-row item-row"
          >
            <div class="col-time">{{ log.time }}</div>
            <div class="col-level">
              <span :class="['level-badge', log.level.toLowerCase()]">{{ log.level }}</span>
            </div>
            <div class="col-msg">{{ log.msg }}</div>
          </div>
        </div>
      </div>

      <div class="log-footer">
        <span class="info-text">Total {{ parsedLogs.length }} lines (Reverse Order)</span>
        <div class="action-group">
          <button @click="copyLog" class="btn copy">📋 Copy</button>
          <button @click="fetchLog" class="btn refresh">🔄 Refresh</button>
          <button @click="clearLog" class="btn clear">🗑️ Clear</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRemoteConfig } from '../composables/useRemoteConfig';

defineEmits(['close']);
const { config } = useRemoteConfig();

const isLoading = ref(false);
const rawLogContent = ref('');
const readSize = (config.value.logViewer?.readSizeKB || 50) * 1024;

const parsedLogs = computed(() => {
  if (!rawLogContent.value) return [];
  const lines = rawLogContent.value.split(/[\r\n]+/).reverse();

  return lines.map(line => {
    if (!line.trim()) return null;
    const regex = /^\[(.*?)\] \[(.*?)\] (.*)$/;
    const match = line.match(regex);
    if (match) {
      return { time: match[1], level: match[2], msg: match[3] };
    } else {
      return { time: '-', level: 'RAW', msg: line };
    }
  }).filter(item => item !== null);
});

const fetchLog = async () => {
  isLoading.value = true;
  if (window.electron) {
    try {
      const logs = await window.electron.ipcRenderer.getSystemLog(readSize);
      rawLogContent.value = logs || '';
    } catch (e) {
      rawLogContent.value = `[Error] ${e.message}`;
    } finally {
      setTimeout(() => { isLoading.value = false; }, 200);
    }
  }
};

const clearLog = async () => {
  if (!confirm('로그를 삭제하시겠습니까?')) return;
  if (window.electron) {
    await window.electron.ipcRenderer.deleteSystemLog();
    fetchLog();
  }
};

const copyLog = async () => {
  try {
    await navigator.clipboard.writeText(rawLogContent.value);
    alert('복사되었습니다.');
  } catch (e) { alert('실패'); }
};

onMounted(() => {
  fetchLog();
});
</script>

<style scoped>
/* 1. 배경 오버레이 */
.log-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  
  /* ★ [수정] 배경색 투명으로 변경 */
  background-color: transparent; 
  /* backdrop-filter: blur(5px); */ /* 흐림 효과도 제거 (원하시면 주석 해제) */
  
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

/* 2. 윈도우 창 */
.log-window {
  width: 90%;
  /* ★ [수정] 높이 80%로 변경 */
  height: 80%; 
  max-width: 1200px;
  background-color: #0d1117;
  border: 1px solid #30363d;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  
  /* 그림자를 진하게 주어 배경과 구분 */
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 30px 60px rgba(0,0,0,0.8);
  overflow: hidden;
}

/* 3. 헤더 */
.log-header {
  height: 48px;
  background-color: #161b22;
  border-bottom: 1px solid #30363d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 10px; }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.dot.red { background: #ff5f56; }
.dot.yellow { background: #ffbd2e; }
.dot.green { background: #27c93f; }
.title { color: #58a6ff; font-weight: bold; font-size: 14px; margin-left: 10px; }
.badge { background: #21262d; color: #8b949e; padding: 2px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #30363d; }
.close-btn { background: none; border: none; color: #8b949e; font-size: 18px; cursor: pointer; }
.close-btn:hover { color: white; }

/* 4. 로그 바디 */
.log-body {
  flex: 1;
  overflow-y: auto;
  background-color: #0d1117;
  position: relative;
}
.status-msg { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8b949e; gap: 10px; }
.spinner { width: 30px; height: 30px; border: 3px solid #30363d; border-top-color: #58a6ff; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 5. 로그 테이블 */
.log-row {
  display: grid;
  grid-template-columns: 180px 80px 1fr;
  border-bottom: 1px solid #21262d;
  font-size: 12px;
  line-height: 1.5;
}
.header-row {
  background-color: #161b22;
  color: #8b949e;
  font-weight: bold;
  position: sticky;
  top: 0;
  z-index: 10;
}
.item-row:hover { background-color: rgba(255,255,255,0.03); }

.col-time, .col-level, .col-msg { padding: 8px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-time { color: #8b949e; border-right: 1px solid #21262d; }
.col-level { display: flex; align-items: center; justify-content: center; border-right: 1px solid #21262d; }
.col-msg { color: #c9d1d9; white-space: pre-wrap; word-break: break-all; }

.level-badge { padding: 2px 6px; border-radius: 3px; font-weight: bold; text-transform: uppercase; font-size: 10px; width: 100%; text-align: center; }
.level-badge.info { background: rgba(56, 139, 253, 0.15); color: #58a6ff; border: 1px solid rgba(56, 139, 253, 0.4); }
.level-badge.warn { background: rgba(210, 153, 34, 0.15); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
.level-badge.error { background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
.level-badge.raw { background: #30363d; color: #8b949e; }

/* 6. 푸터 */
.log-footer {
  height: 50px;
  background-color: #161b22;
  border-top: 1px solid #30363d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.info-text { color: #8b949e; font-size: 11px; }
.action-group { display: flex; gap: 8px; }
.btn { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
.btn.copy { background: #21262d; color: #c9d1d9; border-color: #30363d; }
.btn.copy:hover { background: #30363d; border-color: #8b949e; }
.btn.refresh { background: #1f6feb; color: white; }
.btn.refresh:hover { background: #388bfd; }
.btn.clear { background: rgba(248, 81, 73, 0.1); color: #f85149; border-color: rgba(248, 81, 73, 0.4); }
.btn.clear:hover { background: rgba(248, 81, 73, 0.2); }

.log-body::-webkit-scrollbar { width: 10px; }
.log-body::-webkit-scrollbar-track { background: #0d1117; }
.log-body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 5px; border: 2px solid #0d1117; }
.log-body::-webkit-scrollbar-thumb:hover { background: #8b949e; }
</style>