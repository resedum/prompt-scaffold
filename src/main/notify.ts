/**
 * 跨平台通知统一封装（CROSS-PLATFORM-PLAN §4.3 / R16）。
 * - 先 Notification.isSupported() 判断；不支持/失败降级为日志 + 托盘气泡（由调用方决定）
 * - Windows 需先 app.setAppUserModelId（在 index.ts 启动时设置）
 * - mac 未授权时 Notification 静默失败；linux 走 libnotify
 * 绝不因通知失败而闪退。
 */
import { Notification } from 'electron'

export function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body })
      n.show()
      return
    }
  } catch (err) {
    console.error('[notify] 发送通知失败（已降级）', err)
  }
  // 降级：记录到日志（托盘气泡由调用方按需处理）
  console.log(`[notify] ${title}: ${body}`)
}
