/**
 * 托盘常驻（ARCHITECTURE §1.7 + CROSS-PLATFORM-PLAN §4.1 / R6）。
 * - mac：单色模板图（不 resize，自动适配 @2x + 深浅菜单栏）
 * - win：优先 .ico，缺省 PNG resize 16
 * - linux：PNG resize 16；创建失败只记日志不闪退
 */
import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { APP_NAME } from '../shared/constants'
import { IS_MAC, IS_WIN } from '../shared/platform'
import { showWindow, getMainWindow, setQuitting } from './window'

let tray: Tray | null = null

function resourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '../../resources', name)
}

function loadTrayIcon(): Electron.NativeImage {
  // macOS：模板图（单色 + alpha），随菜单栏深浅色自适应；不 resize
  if (IS_MAC) {
    const img = nativeImage.createFromPath(resourcePath('tray-iconTemplate.png'))
    if (!img.isEmpty()) {
      img.setTemplateImage(true)
      return img
    }
  }
  // Windows：优先 .ico；缺省回退 PNG
  if (IS_WIN) {
    const ico = nativeImage.createFromPath(resourcePath('tray-icon.ico'))
    if (!ico.isEmpty()) return ico.resize({ width: 16, height: 16 })
  }
  const png = nativeImage.createFromPath(resourcePath('tray-icon.png'))
  if (!png.isEmpty()) return png.resize({ width: 16, height: 16 })
  return fallbackTransparent()
}

function fallbackTransparent(): Electron.NativeImage {
  // 极小透明 PNG，避免文件缺失时崩溃
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  )
}

export function createTray(): void {
  try {
    const icon = loadTrayIcon()
    tray = new Tray(icon)
    tray.setToolTip(APP_NAME)
    const menu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showWindow() },
      { label: '隐藏', click: () => getMainWindow()?.hide() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          setQuitting(true)
          app.quit()
        }
      }
    ])
    tray.setContextMenu(menu)
    tray.on('click', () => showWindow())
  } catch (err) {
    console.error('[tray] 创建托盘失败（已降级为仅窗口）', err)
  }
}
