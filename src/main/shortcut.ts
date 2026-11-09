/**
 * 全局快捷键统一封装（CROSS-PLATFORM-PLAN §4.4 / R17）。
 * 注册失败（mac 未授权/冲突）静默降级，不强制、不闪退。
 */
import { globalShortcut } from 'electron'

/** 注册全局快捷键；返回是否成功（false=未授权或冲突，调用方降级处理） */
export function registerGlobalShortcut(accelerator: string, callback: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, callback)
  } catch {
    return false
  }
}

/** 注销全局快捷键（幂等） */
export function unregisterGlobalShortcut(accelerator: string): void {
  try {
    globalShortcut.unregister(accelerator)
  } catch {
    /* ignore */
  }
}
