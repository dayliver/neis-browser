// import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { app, shell, BrowserWindow, ipcMain, safeStorage, Menu, MenuItem } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'

app.name = '나이스브라우저';

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 720, show: false, 
    autoHideMenuBar: true, // 메뉴바 다시 숨김
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#dadada', symbolColor: '#000000', height: 45 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      devTools: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ★★★ [자동 업데이트 설정 시작] ★★★
  
  // 1. 코드 서명 검증 무시 (인증서 없을 때 필수)
  autoUpdater.verifyUpdateCodeSignature = false;
  
  // 2. 업데이트 로그 (선택 사항, 개발 중 확인용)
  autoUpdater.logger = require("electron-log");
  autoUpdater.logger.transports.file.level = "info";

  // 3. 업데이트 확인 주기 (앱 켜지고 3초 뒤 확인 시작)
  // 개발 모드(is.dev)에서는 동작하지 않으므로 빌드 후에만 작동함
  if (!is.dev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 3000);
  }

  // [이벤트 1] 업데이트가 감지되었을 때
  autoUpdater.on('update-available', () => {
    // 사용자에게 알리거나 조용히 다운로드 시작 (여기선 자동 다운로드됨)
    console.log('업데이트 발견! 다운로드 시작...');
  });

  // [이벤트 2] 다운로드 완료 후 설치 유도
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '업데이트 설치',
      message: '새로운 버전이 다운로드되었습니다.\n지금 재시작하여 설치하시겠습니까?',
      buttons: ['지금 재시작', '나중에']
    }).then((result) => {
      if (result.response === 0) { // '지금 재시작' 클릭 시
        autoUpdater.quitAndInstall(false, true); // (silent, forceRunAfter)
      }
    });
  });

  // [이벤트 3] 에러 발생 시
  autoUpdater.on('error', (err) => {
    console.error('업데이트 에러:', err);
    // 필요하다면 dialog로 사용자에게 알림
  });
  
  // ★★★ [자동 업데이트 설정 끝] ★★★
}

// ★★★ [신규] 메뉴 생성 함수 ★★★
function setupAppMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Shortcuts',
      submenu: [
        {
          label: 'Search',
          accelerator: 'F3', // F3 키 등록
          click: () => {
            console.log('[Main] F3 눌림 -> Vue로 전송');
            if (mainWindow) mainWindow.webContents.send('cmd-toggle-search');
          }
        },
        {
          label: 'Find',
          accelerator: 'CommandOrControl+F', // Ctrl+F 등록
          click: () => {
            console.log('[Main] Ctrl+F 눌림 -> Vue로 전송');
            // if (mainWindow) mainWindow.webContents.send('cmd-show-alert');
            if (mainWindow) mainWindow.webContents.send('cmd-toggle-search');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  setupAppMenu();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. 기본 핸들러
  ipcMain.handle('encrypt-password', async (e, t) => safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t).toString('hex') : null);
  ipcMain.handle('decrypt-password', async (e, h) => safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(h, 'hex')) : null);
  ipcMain.handle('get-preload-path', () => join(__dirname, '../preload/index.js'));

  // 2. 중계 핸들러
  ipcMain.on('bridge-req-pass', () => mainWindow?.webContents.send('bridge-req-pass-to-vue'));
  ipcMain.on('req-type-password', () => mainWindow?.webContents.send('req-type-password-to-vue'));
  ipcMain.on('bridge-create-tab', (e, url) => mainWindow?.webContents.send('request-new-tab', url));

  // 단축키 중계 (Preload -> Vue)
  ipcMain.on('req-toggle-search', () => {
    console.log('[Main] 내부 단축키 중계');
    if (mainWindow) mainWindow.webContents.send('cmd-toggle-search');
  });
  
  // 메뉴 데이터 중계
  ipcMain.on('bridge-menu-data', (e, data) => {
    if (mainWindow) mainWindow.webContents.send('res-extract-menu-to-vue', data);
  });

  // 붙여넣기 요청 중계 (Preload -> Main -> Vue)
  ipcMain.on('req-paste-grid', (event, payload) => {
    // 메시지를 보낸 웹컨텐츠(Webview)가 속한 윈도우 찾기
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents) || BrowserWindow.getAllWindows()[0];
    
    if (win) {
      // Vue 렌더러로 그대로 토스
      win.webContents.send('req-paste-grid', payload);
    }
  });

  // ★★★ [추가] 윈도우 최대화 요청 처리 핸들러 ★★★
  ipcMain.on('req-window-maximize', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
  });

  // (단축키 관련 핸들러 삭제됨)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})