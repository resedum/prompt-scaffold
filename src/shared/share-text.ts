/**
 * 分享链接抓取的纯函数部分（ARCHITECTURE v2 §3.2）。
 * 不 import electron，保证 node:test 可直接单测。
 */
import { SHARE_FETCH_MIN_TEXT_CHARS } from './constants'

/** 带错误码的抓取错误（IPC 层据此映射 SHARE_FETCH_FAILED） */
export class ShareFetchError extends Error {
  code: 'SHARE_FETCH_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'ShareFetchError'
    this.code = 'SHARE_FETCH_FAILED'
  }
}

/** 校验并规范化分享链接：仅 http/https，否则抛 SHARE_FETCH_FAILED */
export function validateShareUrl(url: string): string {
  const trimmed = (url ?? '').trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ShareFetchError('链接格式无效，请输入完整 URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ShareFetchError('仅支持 http/https 链接')
  }
  return parsed.toString()
}

/** 轻量去噪：压缩空行、去除纯符号行与超短导航词 */
export function cleanShareText(text: string): string {
  if (!text) return ''
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !isNoiseLine(l))
    .join('\n')
}

function isNoiseLine(line: string): boolean {
  // 纯符号（分隔线/装饰）行
  if (/^[^\p{L}\p{N}]{2,}$/u.test(line)) return true
  // 超短导航词（常见分享页头部按钮）
  const navWords =
    /^(登录|注册|分享|复制|点赞|评论|收藏|下载|打开|Menu|Share|Copy|Like|Comment|Log in|Sign in|Sign up|Download)$/iu
  if (line.length <= 8 && navWords.test(line)) return true
  return false
}

/** 正文是否达到「可视为抓取成功」的长度阈值 */
export function hasEnoughShareText(text: string, min = SHARE_FETCH_MIN_TEXT_CHARS): boolean {
  return cleanShareText(text).length >= min
}

/** 登录墙/验证页启发式：正文短且含登录/验证关键词 */
export function looksLikeLoginWall(text: string): boolean {
  const cleaned = cleanShareText(text)
  if (cleaned.length >= SHARE_FETCH_MIN_TEXT_CHARS) return false
  return /登录|验证码|verify|captcha|log in|sign in/i.test(cleaned)
}
