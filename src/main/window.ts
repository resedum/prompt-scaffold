/**
 * 主窗口创建 / 显隐（ARCHITECTURE §1.7）。
 * 关闭窗口时 preventDefault + hide（托盘常驻，非退出）。
 */
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { APP_NAME } from '../shared/constants'

let mainWindow: BrowserWindow | null = null
let quitting = false

export function setQuitting(v: boolean): void {
  quitting = v
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function createWindow(): BrowserWindow {
  if (getMainWindow()) return getMainWindow()!

  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: APP_NAME,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function showWindow(): void {
  const win = getMainWindow() ?? createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function hideWindow(): void {
  mainWindow?.hide()
}
