/**
 * 跨平台分支唯一入口（CROSS-PLATFORM-PLAN §2.4）。
 * 全工程只允许通过这里取平台，禁止散落 `process.platform === '...'` 魔法串。
 *
 * 说明：用 `globalThis.process` 读取而非直接引用 `process`，是为了让本文件
 * 在渲染层 tsconfig（无 node 类型）下也能通过类型检查。Electron 主/预加载
 * 进程里 `globalThis.process` 即 Node 的 process；渲染层（即便意外被引用）安全回落 'linux'。
 */

export type PlatformName = 'win32' | 'darwin' | 'linux'

function detectPlatform(): PlatformName {
  const p = (globalThis as { process?: { platform?: string } }).process?.platform
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p
  // 兜底：其余平台按 linux 保守处理
  return 'linux'
}

export const PLATFORM: PlatformName = detectPlatform()
export const IS_MAC = PLATFORM === 'darwin'
export const IS_WIN = PLATFORM === 'win32'
export const IS_LINUX = PLATFORM === 'linux'

/** 强制穷尽的平台分发：缺某个平台 TS 直接报错（Record<PlatformName, ...> 全量约束） */
export function onPlatform<T>(handlers: Record<PlatformName, () => T>): T {
  return handlers[PLATFORM]()
}
