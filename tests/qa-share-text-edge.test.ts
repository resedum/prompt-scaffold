/**
 * QA 边界补充测试：分享链接抓取纯函数边界（ARCHITECTURE v2 §3.2）。
 * 覆盖：URL 协议/空白/危险协议、去噪 CRLF/全噪声、正文长度自定义阈值、登录墙关键词变体。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanShareText,
  hasEnoughShareText,
  looksLikeLoginWall,
  validateShareUrl,
  ShareFetchError
} from '../src/shared/share-text'

const isShareErr = (e: unknown): boolean => (e as ShareFetchError).code === 'SHARE_FETCH_FAILED'

test('validateShareUrl：trim 掉首尾空白后仍可解析', () => {
  assert.match(validateShareUrl('  https://example.com/a  '), /^https:\/\/example\.com\/a$/)
})

test('validateShareUrl：javascript:/data:/file: 等非 http 协议抛 SHARE_FETCH_FAILED', () => {
  assert.throws(() => validateShareUrl('javascript:alert(1)'), isShareErr)
  assert.throws(() => validateShareUrl('data:text/html,hi'), isShareErr)
  assert.throws(() => validateShareUrl('file:///etc/passwd'), isShareErr)
})

test('validateShareUrl：空串/纯空白抛 SHARE_FETCH_FAILED', () => {
  assert.throws(() => validateShareUrl(''), isShareErr)
  assert.throws(() => validateShareUrl('   '), isShareErr)
})

test('cleanShareText：CRLF 换行被统一处理', () => {
  assert.equal(cleanShareText('a\r\n\r\nb\r\n'), 'a\nb')
})

test('cleanShareText：全为噪声行时返回空串', () => {
  assert.equal(cleanShareText('登录\n分享\n------'), '')
})

test('hasEnoughShareText：支持自定义阈值', () => {
  assert.equal(hasEnoughShareText('abc', 3), true)
  assert.equal(hasEnoughShareText('abc', 4), false)
})

test('looksLikeLoginWall：验证码/英文大小写关键词均命中', () => {
  assert.equal(looksLikeLoginWall('请输入验证码'), true)
  assert.equal(looksLikeLoginWall('Please verify you are human'), true)
  assert.equal(looksLikeLoginWall('Please log in to view this conversation'), true)
})

test('looksLikeLoginWall：裸「Sign in」导航行被 cleanShareText 先剥离，仅靠长度门槛兜底', () => {
  // 说明：cleanShareText 会把整行「Sign in / Log in / 登录」当作导航词去除，
  // 因此仅含这类词的极简登录墙不会被本函数命中；但主闸 hasEnoughShareText 仍会判失败。
  assert.equal(looksLikeLoginWall('Sign in'), false)
  assert.equal(hasEnoughShareText('Sign in'), false)
})

test('looksLikeLoginWall：长正文即使含「登录」也不误判', () => {
  assert.equal(looksLikeLoginWall('登录' + 'A'.repeat(200)), false)
})
