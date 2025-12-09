import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'
import { statSync, createReadStream, writeFileSync, existsSync } from 'fs'

// ★ [수정] mainWindow를 전역 변수로 선언 (중복 실행 방지 로직에서 접근하기 위해)
let mainWindow = null

// =================================================================
// 🛡️ [추가] 중복 실행 방지 & 좀비 프로세스 차단 로직
// =================================================================
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 1. 락을 얻지 못했다면(이미 실행 중), 즉시 종료 (캐시 파일 보호)
  app.quit()
} else {
  // 2. 락을 얻었다면(첫 번째 인스턴스), 이벤트 리스너 등록 후 앱 실행
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 누군가 두 번째 인스턴스를 실행하려고 시도함 -> 내 창을 띄워줌
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // =========================================================
  // 🚀 [기존 로직 시작]
  // =========================================================

  function createWindow() {
    // ★ [수정] 전역 변수 mainWindow 사용 (const 제거)
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden', 
      // 윈도우 컨트롤 버튼 스타일링
      titleBarOverlay: {
        color: '#dadada',      // BrowserTitleBar 배경색과 일치
        symbolColor: '#555555', // 아이콘 색상
        height: 45             // BrowserTitleBar 높이와 일치
      },
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webviewTag: true
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // =========================================================
    // [0] 기본 필수 핸들러
    // =========================================================
    
    ipcMain.handle('get-preload-path', () => {
      return join(__dirname, '../preload/index.js')
    })

    ipcMain.handle('encrypt-password', async (_, plainText) => {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(plainText).toString('hex')
      }
      throw new Error('Encryption not available')
    })

    // 복호화 에러 방지 처리 (키 변경 시 앱 뻗음 방지)
    ipcMain.handle('decrypt-password', async (_, encryptedHex) => {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(Buffer.from(encryptedHex, 'hex'))
        }
        throw new Error('Decryption not available')
      } catch (error) {
        console.error('[Main] 비밀번호 복호화 실패 (재저장 필요):', error.message)
        return '' // 빈 문자열 반환하여 재입력 유도
      }
    })


    // =========================================================
    // [1] 자동 업데이트 설정
    // =========================================================
    autoUpdater.verifyUpdateCodeSignature = false; 

    if (!is.dev) {
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, 3000);
    }

    autoUpdater.on('update-available', () => {
      console.log('업데이트 발견! 다운로드 시작...');
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '업데이트 설치',
        message: '새로운 버전이 다운로드되었습니다.\n지금 재시작하여 설치하시겠습니까?',
        buttons: ['지금 재시작', '나중에']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('업데이트 에러:', err);
    });


    // =========================================================
    // [2] 기능 핸들러 (UI 제어, 포커스 등)
    // =========================================================

    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.on('req-window-maximize', () => {
      if (mainWindow && !mainWindow.isMaximized()) {
        mainWindow.maximize();
      }
    });

    // 탭 생성 핸들러
    ipcMain.on('bridge-create-tab', (event, url) => {
      const webContents = event.sender;
      const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
      if (win) {
        win.webContents.send('request-new-tab', url);
      }
    });

    // 메뉴 데이터 전달
    ipcMain.on('bridge-menu-data', (event, payload) => {
      // 확장성을 위해 유지
    });

    ipcMain.on('req-paste-grid', (event, payload) => {
      const webContents = event.sender;
      const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
      if (win) {
        win.webContents.send('req-paste-grid', payload);
      }
    });

    // 비밀번호 입력 요청
    ipcMain.on('req-type-password', (event) => {
      const webContents = event.sender;
      const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
      if (win) {
        win.webContents.send('req-type-password-to-vue');
      }
    });

    // 포커스 복구 (Soft Reset)
    ipcMain.on('req-fix-ime-focus', () => {
      if (mainWindow) {
        mainWindow.setAlwaysOnTop(true);
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
             mainWindow.setAlwaysOnTop(false);
             mainWindow.focus();
             mainWindow.webContents.focus();
          }
        }, 1); 
      }
    });

    // 검색 단축키 중계
    ipcMain.on('req-toggle-search', () => {
      if (mainWindow) {
        mainWindow.webContents.send('cmd-toggle-search');
      }
    });

    // =========================================================
    // [3] 로그 뷰어 핸들러
    // =========================================================
    
    const getLogPath = () => join(app.getPath('userData'), 'logs/main.log');

    ipcMain.handle('get-system-log', async (event, readSizeBytes = 51200) => {
      const logPath = getLogPath();
      if (!existsSync(logPath)) return "로그 파일이 존재하지 않습니다.";

      try {
        const stats = statSync(logPath);
        const fileSize = stats.size;
        const start = Math.max(0, fileSize - readSizeBytes);
        
        return new Promise((resolve, reject) => {
          const stream = createReadStream(logPath, { start, encoding: 'utf8' });
          let data = '';
          stream.on('data', chunk => data += chunk);
          stream.on('end', () => { 
            const prefix = start > 0 ? `... (Skip ${Math.floor(start/1024)}KB) ...\n` : '';
            resolve(prefix + data); 
          });
          stream.on('error', err => reject(err.message));
        });
      } catch (err) {
        return `로그 읽기 실패: ${err.message}`;
      }
    });

    ipcMain.handle('delete-system-log', async () => {
      try {
        writeFileSync(getLogPath(), '');
        return true;
      } catch (error) {
        console.error('로그 삭제 실패:', error);
        return false;
      }
    });

    return mainWindow
  }

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.neisbrowser.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // ★ 팝업 -> 새 탭 전환 로직
    app.on('web-contents-created', (event, contents) => {
      if (contents.getType() === 'webview') {
        
        contents.setWindowOpenHandler((details) => {
          const { url } = details;
          console.log('[Main] Popup intercepted:', url);

          // 업무 포털 관련 URL이면 -> 탭으로 열기
          if (url.includes('neis.go.kr') || url.includes('edufine') || url.length > 50) {
            if (mainWindow) {
              mainWindow.webContents.send('request-new-tab', url);
            }
            return { action: 'deny' }; 
          }

          // 그 외(주소검색 등)는 진짜 팝업 허용
          return { action: 'allow' };
        });
      }
    });
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

} // End of else (gotTheLock)