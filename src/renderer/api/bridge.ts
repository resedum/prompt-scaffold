/**
 * 渲染进程调用封装：window.api 类型声明 + 便捷引用。
 */
import type { RendererApi } from '../../shared/ipc-contract'

declare global {
  interface Window {
    api: RendererApi
  }
}

export const bridge: RendererApi = window.api
