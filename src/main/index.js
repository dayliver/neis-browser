import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden', // 윈도우 11 스타일
    titleBarOverlay: {
      color: '#f3f3f3',
      symbolColor: '#000000',
      height: 45
    },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true // 웹뷰 허용 필수
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
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. 암호화/복호화
  ipcMain.handle('encrypt-password', async (event, text) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.encryptString(text).toString('hex');
  });
  ipcMain.handle('decrypt-password', async (event, hex) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(hex, 'hex'));
  });

  // 2. Preload 경로 제공
  ipcMain.handle('get-preload-path', () => {
    return join(__dirname, '../preload/index.js');
  });

  // 3. [중계] 비밀번호 요청 (Preload -> Vue)
  ipcMain.on('bridge-req-pass', () => {
    if (mainWindow) mainWindow.webContents.send('bridge-req-pass-to-vue');
  });

  // 4. [중계] 새 탭 생성 요청 (Preload -> Vue)
  ipcMain.on('bridge-create-tab', (event, url) => {
    if (mainWindow) mainWindow.webContents.send('request-new-tab', url);
  });

  // ★★★ [추가] 타이핑 요청 중계 (Preload -> Main -> Vue) ★★★
  ipcMain.on('req-type-password', () => {
    if (mainWindow) mainWindow.webContents.send('req-type-password-to-vue');
  });

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