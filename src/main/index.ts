/**
 * 应用生命周期入口（ARCHITECTURE §4.1 / T05）。
 * - 单实例锁
 * - Storage + 记忆系统 + IPC + 主窗口 + 托盘 + mac 菜单 + 全局快捷键
 * - 关闭窗口隐藏（托盘常驻），退出前 flush 落盘
 */
import { app, BrowserWindow } from 'electron'
import { Storage } from './storage/store'
import { registerIpc } from './ipc'
import { createWindow, showWindow, setQuitting, getMainWindow } from './window'
import { createTray } from './tray'
import { setupAppMenu } from './menu'
import { registerGlobalShortcut } from './shortcut'
import { initMemorySystem } from './memory'
import { APP_ID } from '../shared/constants'
import { IS_WIN } from '../shared/platform'

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  // 兜底（防御纵深）：任何漏网的定时器/异步异常都只记日志、保活，不让主进程闪退。
  process.on('uncaughtException', (err) => {
    console.error('[main] uncaughtException（已捕获，保持运行）', err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection（已捕获，保持运行）', reason)
  })

  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    Storage.init(app.getPath('userData'))

    // Windows：设置 AppUserModelId，保证通知显示与任务栏正确归组（R8/R16）
    if (IS_WIN) {
      try {
        app.setAppUserModelId(APP_ID)
      } catch {
        /* ignore */
      }
    }

    // macOS 应用菜单（R5：Cmd+C/V/Q/A 依赖 menu role）
    setupAppMenu()

    initMemorySystem(app.getPath('userData'), {
      getModelConfig: () => Storage.getInstance().get('model'),
      getHabits: () => Storage.getInstance().get('dimensionHabits')
    })

    registerIpc()
    createWindow()
    createTray()

    // 全局快捷键唤起（失败静默降级为托盘，R17）
    const okShortcut = registerGlobalShortcut('CommandOrControl+Shift+Space', () => showWindow())
    if (!okShortcut) {
      console.warn('[main] 全局快捷键注册失败（未授权或冲突），可使用托盘图标唤起主窗口')
    }

    // 冒烟测试：PROMPT_SCAFFOLD_SMOKE=1 时启动后自动退出，用于无头环境验证主进程可正常引导
    if (process.env['PROMPT_SCAFFOLD_SMOKE'] === '1') {
      setTimeout(() => {
        setQuitting(true)
        app.quit()
      }, 3000)
    }

    // 截图模式：PROMPT_SCAFFOLD_SCREENSHOT=1 时，窗口渲染完成后截图保存 PNG 并退出（用于生成 README 截图）
    if (process.env['PROMPT_SCAFFOLD_SCREENSHOT'] === '1') {
      setTimeout(async () => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          try {
            const image = await win.webContents.capturePage()
            const { writeFileSync } = await import('fs')
            const out = process.env['PROMPT_SCAFFOLD_SCREENSHOT_PATH'] || 'screenshot.png'
            writeFileSync(out, image.toPNG())
            console.log('[main] screenshot saved: ' + out)
          } catch (err) {
            console.error('[main] screenshot failed', err)
          }
        }
        setQuitting(true)
        app.quit()
      }, 3500)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })

  // 托盘常驻：所有平台窗口全部关闭时不退出（仅在显式退出时结束）
  app.on('window-all-closed', () => {
    // 保持运行，由托盘退出
  })

  app.on('before-quit', () => {
    setQuitting(true)
    try {
      Storage.getInstance().flush()
    } catch {
      /* 尚未初始化则忽略 */
    }
  })

  // 保持 getMainWindow 引用（供 ipc 使用）
  void getMainWindow
}
