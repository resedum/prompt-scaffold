/**
 * 分享链接抓取纯函数单测（ARCHITECTURE v2 §3.2 / T04）。
 * 真实 BrowserWindow 抓取无法在 node:test 无头跑，此处只测纯函数。
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

test('cleanShareText：压缩多余空行', () => {
  assert.equal(cleanShareText('a\n\n\nb'), 'a\nb')
})

test('cleanShareText：去除纯符号与导航行', () => {
  const text = '登录\n------\n这是正文第一段\n分享\n这是正文第二段'
  assert.equal(cleanShareText(text), '这是正文第一段\n这是正文第二段')
})

test('hasEnoughShareText：达到阈值才算成功', () => {
  assert.equal(hasEnoughShareText('字'.repeat(120)), true)
  assert.equal(hasEnoughShareText('太短'), false)
})

test('validateShareUrl：http/https 合法，其余抛 SHARE_FETCH_FAILED', () => {
  assert.match(validateShareUrl('https://example.com/a'), /^https:\/\//)
  assert.match(validateShareUrl('http://example.com'), /^http:\/\//)
  assert.throws(
    () => validateShareUrl('ftp://example.com'),
    (e) => (e as ShareFetchError).code === 'SHARE_FETCH_FAILED'
  )
  assert.throws(
    () => validateShareUrl('not a url'),
    (e) => (e as ShareFetchError).code === 'SHARE_FETCH_FAILED'
  )
})

test('looksLikeLoginWall：短文本含登录关键词判为登录墙', () => {
  assert.equal(looksLikeLoginWall('请登录后查看'), true)
  assert.equal(looksLikeLoginWall('Sign in to continue'), true)
  assert.equal(looksLikeLoginWall('A'.repeat(130)), false)
})
