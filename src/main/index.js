// import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { app, shell, BrowserWindow, ipcMain, safeStorage, Menu, MenuItem } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

app.name = '나이스브라우저';

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 900, show: false, 
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

  // (단축키 관련 핸들러 삭제됨)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})