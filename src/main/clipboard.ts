/**
 * 剪贴板服务（ARCHITECTURE §1.4）：读取图片 / 写入文本。
 * 纯 Electron 内置 API，零 native 依赖。
 */
import { clipboard } from 'electron'
import type { ImageData } from '../shared/types'

export class ClipboardService {
  /** 读取剪贴板中的图片；无图片返回 null */
  readImage(): ImageData | null {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    const size = img.getSize()
    return { dataUrl: img.toDataURL(), mime: 'image/png', width: size.width, height: size.height }
  }

  writeText(text: string): void {
    clipboard.writeText(text)
  }
}
