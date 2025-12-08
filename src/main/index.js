import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'
import { statSync, createReadStream, writeFileSync, existsSync } from 'fs'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden', 
    // ★★★ [수정 1] 윈도우 컨트롤 버튼 부활 및 스타일링 ★★★
    titleBarOverlay: {
      color: '#dadada',      // BrowserTitleBar 배경색과 일치시킴
      symbolColor: '#555555', // 아이콘 색상 (검은색 계열)
      height: 45             // BrowserTitleBar 높이와 일치시킴
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

  ipcMain.handle('decrypt-password', async (_, encryptedHex) => {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encryptedHex, 'hex'))
    }
    throw new Error('Decryption not available')
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

  // ★★★ [수정 2] 누락된 탭 생성 핸들러 복구 ★★★
  ipcMain.on('bridge-create-tab', (event, url) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
    if (win) {
      // Vue(Renderer)로 "새 탭 만들어라" 명령 전달
      win.webContents.send('request-new-tab', url);
    }
  });

  // 메뉴 데이터 전달 (Preload -> Vue)
  ipcMain.on('bridge-menu-data', (event, payload) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
    if (win) {
      // Vue로직(useMenuSearch)이 리스너를 갖고 있지 않다면 무시되지만,
      // 확장성을 위해 남겨둡니다. (현재 구조에선 Webview.executeJavaScript로 직접 가져오므로 필수는 아님)
    }
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

  // ★★★ [수정] 포커스 복구 (Soft Reset) ★★★
  // blur()는 앱 전환을 유발하므로, AlwaysOnTop 트릭으로 변경합니다.
  ipcMain.on('req-fix-ime-focus', () => {
    if (mainWindow) {
      // 1. 찰나의 순간 '항상 위'로 설정하여 OS의 시선을 강제로 고정
      mainWindow.setAlwaysOnTop(true);
      
      // 2. 즉시 해제하고 포커스 재확인
      // (사용자는 눈치채지 못할 정도로 빠름)
      setTimeout(() => {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.focus();             // 윈도우 활성화
        mainWindow.webContents.focus(); // Vue 렌더러 활성화
      }, 1); 
    }
  });

  // ★★★ [누락된 코드 추가] 검색 단축키 중계 (Preload -> Main -> Vue) ★★★
  ipcMain.on('req-toggle-search', () => {
    if (mainWindow) {
      // Vue(Renderer)에게 "검색창 열어라" 명령 전달
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})