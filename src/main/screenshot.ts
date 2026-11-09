/**
 * 屏幕截图服务（ARCHITECTURE §1.3）。
 * desktopCapturer 抓全屏 → 打开全屏遮罩窗口框选 → NativeImage.crop 裁剪 → base64。
 * 全程官方 API / 纯 JS，零 native 依赖。
 */
import { desktopCapturer, screen, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import type { ImageData, Rect } from '../shared/types'
import { IPC } from '../shared/ipc-contract'
import { IS_MAC } from '../shared/platform'

export class ScreenshotService {
  private pending: {
    image: ImageData
    resolve: (img: ImageData | null) => void
    overlay: BrowserWindow
  } | null = null
  /** 最近一次抓屏的 Retina/缩放倍率（用于逻辑坐标 → 物理像素换算，R7） */
  private scaleFactor = 1

  /** 抓取主屏画面（首版主屏优先；按 scaleFactor 请求物理像素缩略图） */
  async captureScreen(): Promise<ImageData> {
    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    const sf = primary.scaleFactor || 1
    this.scaleFactor = sf
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) }
    })
    const source =
      sources.find((s) => s.display_id === String(primary.id)) ?? sources[0]
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
      throw new Error('SCREENSHOT_FAILED')
    }
    return this.nativeToImageData(source.thumbnail)
  }

  /** 完整截图流程：抓屏 + 打开遮罩 + 等待选区 → 裁剪后返回（取消则返回 null） */
  captureWithSelection(_parent?: BrowserWindow | null): Promise<ImageData | null> {
    return this.captureScreen().then((img) => {
      return new Promise<ImageData | null>((resolve) => {
        const primary = screen.getPrimaryDisplay()
        const overlay = new BrowserWindow({
          x: primary.bounds.x,
          y: primary.bounds.y,
          width: primary.bounds.width,
          height: primary.bounds.height,
          frame: false,
          resizable: false,
          movable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: false,
          backgroundColor: '#000000',
          webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        overlay.setMenuBarVisibility(false)
        // mac 全屏/多 Space 下需 screen-saver 层级 + 跨 Space 可见才能盖住全屏（R7）
        if (IS_MAC) {
          overlay.setAlwaysOnTop(true, 'screen-saver')
          overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
        }
        this.pending = { image: img, resolve, overlay }
        overlay.once('closed', () => {
          if (this.pending?.resolve === resolve) {
            this.pending = null
            resolve(null)
          }
        })
        this.loadOverlay(overlay)
        overlay.once('ready-to-show', () => overlay.show())
      })
    })
  }

  private loadOverlay(overlay: BrowserWindow): void {
    const url = process.env['ELECTRON_RENDERER_URL']
    if (url) {
      overlay.loadURL(`${url}#screenshot`)
    } else {
      overlay.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'screenshot' })
    }
  }

  /** 遮罩窗口取图 */
  getPendingImage(): ImageData | null {
    return this.pending?.image ?? null
  }

  /** 遮罩窗口提交选区；rect 为 null 表示取消 */
  finishSelection(rect: Rect | null): void {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    try {
      const result = rect ? this.crop(pending.image, rect) : null
      pending.resolve(result)
    } catch {
      pending.resolve(null)
    } finally {
      if (!pending.overlay.isDestroyed()) pending.overlay.destroy()
    }
  }

  /** 按选区裁剪（逻辑坐标 × scaleFactor → 物理像素，R7） */
  crop(img: ImageData, rect: Rect): ImageData {
    const native = nativeImage.createFromDataURL(img.dataUrl)
    const size = native.getSize()
    const sf = this.scaleFactor || 1
    const x = clamp(Math.round(rect.x * sf), 0, size.width - 1)
    const y = clamp(Math.round(rect.y * sf), 0, size.height - 1)
    const w = clamp(Math.round(rect.w * sf), 1, size.width - x)
    const h = clamp(Math.round(rect.h * sf), 1, size.height - y)
    const cropped = native.crop({ x, y, width: w, height: h })
    if (cropped.isEmpty()) throw new Error('SCREENSHOT_FAILED')
    return this.nativeToImageData(cropped)
  }

  private nativeToImageData(img: Electron.NativeImage): ImageData {
    const size = img.getSize()
    return { dataUrl: img.toDataURL(), mime: 'image/png', width: size.width, height: size.height }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
