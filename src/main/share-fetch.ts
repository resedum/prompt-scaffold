/**
 * 分享链接抓取（ARCHITECTURE v2 §3.2）：隐藏 BrowserWindow 尽力抓取 + 失败兜底。
 * 纯函数 validateShareUrl / cleanShareText / 判定在 ../shared/share-text（可无头单测）。
 */
import { BrowserWindow } from 'electron'
import {
  SHARE_FETCH_TIMEOUT_MS,
  SHARE_FETCH_POLL_MS,
  SHARE_FETCH_MIN_TEXT_CHARS
} from '../shared/constants'
import {
  validateShareUrl,
  cleanShareText,
  hasEnoughShareText,
  looksLikeLoginWall,
  ShareFetchError
} from '../shared/share-text'
import { onPlatform } from '../shared/platform'

/** 伪装桌面 Chrome UA（按平台生成，降低被识别为无头/机器人的概率，R10） */
const DESKTOP_CHROME_UA = onPlatform({
  win32: () =>
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  darwin: () =>
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  linux: () =>
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
})

/** 独立、非持久化 session 分区（不共享主窗口 cookie） */
const SHARE_SESSION_PARTITION = 'prompt-scaffold-share'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 给任意 Promise 加竞速超时：超时 reject 一个 SHARE_FETCH_FAILED 错误，并清理计时器 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ShareFetchError(message))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

export class ShareLinkFetcher {
  async fetchText(url: string): Promise<string> {
    const target = validateShareUrl(url)
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: SHARE_SESSION_PARTITION
      }
    })
    try {
      // 拒绝所有权限请求（通知/摄像头/定位等），避免无头窗口弹权限
      win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
      try {
        // loadURL 同样纳入 15s 竞速超时：避免 did-finish-load/did-fail-load 迟迟不触发时挂死、泄漏隐藏窗口
        await withTimeout(
          win.loadURL(target, { userAgent: DESKTOP_CHROME_UA }),
          SHARE_FETCH_TIMEOUT_MS,
          '加载分享链接超时'
        )
        const text = await this.waitForText(win)
        if (looksLikeLoginWall(text) || !hasEnoughShareText(text)) {
          throw new ShareFetchError('正文不足或疑似需登录/验证，无法自动抓取')
        }
        return cleanShareText(text)
      } catch (err) {
        if (err instanceof ShareFetchError) throw err
        throw new ShareFetchError('抓取分享链接失败：' + (err instanceof Error ? err.message : String(err)))
      }
    } finally {
      // 成功/失败/超时均销毁窗口
      if (!win.isDestroyed()) win.destroy()
    }
  }

  /** did-finish-load 后每 400ms 轮询 document.body.innerText，15s 超时返回已抓内容 */
  private async waitForText(win: BrowserWindow): Promise<string> {
    const start = Date.now()
    let prev = ''
    while (true) {
      if (win.isDestroyed()) throw new ShareFetchError('抓取窗口已关闭')
      let raw = ''
      try {
        raw = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""')
      } catch {
        raw = ''
      }
      const text = cleanShareText(String(raw ?? ''))
      // 满足「正文长度 ≥ 阈值」且「相邻两次长度增长 < 20%」即认为渲染完成
      if (text.length >= SHARE_FETCH_MIN_TEXT_CHARS && isStable(text, prev)) {
        return text
      }
      prev = text
      if (Date.now() - start >= SHARE_FETCH_TIMEOUT_MS) {
        return text
      }
      await sleep(SHARE_FETCH_POLL_MS)
    }
  }
}

/** 相邻两次长度增长 < 20% 视为渲染稳定（避免 SPA 还在持续追加） */
function isStable(current: string, prev: string): boolean {
  if (!prev) return false
  return current.length - prev.length < prev.length * 0.2
}
