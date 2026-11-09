/**
 * 应用菜单（CROSS-PLATFORM-PLAN §4.2 / R5）。
 * - macOS：必须设应用菜单（含 editMenu role），否则 Cmd+C/V/Q/A 失效
 * - Windows/Linux：保持隐藏菜单（输入框内自带 Ctrl+C/V）
 */
import { Menu } from 'electron'
import { IS_MAC } from '../shared/platform'
import { showWindow } from './window'

export function setupAppMenu(): void {
  if (IS_MAC) {
    const menu = Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: '窗口',
        submenu: [
          { label: '显示主窗口', click: () => showWindow() },
          { role: 'close' }
        ]
      }
    ])
    Menu.setApplicationMenu(menu)
  } else {
    Menu.setApplicationMenu(null)
  }
}
