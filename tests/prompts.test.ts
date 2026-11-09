import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDimensionsPrompt,
  buildSummaryPrompt,
  estimateTokens,
  chunkText,
  truncateKeepHeadTail
} from '../src/main/ai/prompts'

test('buildDimensionsPrompt：注入原始输入与长期偏好', () => {
  const p = buildDimensionsPrompt(
    { text: '写一份汇报', images: [], language: 'zh' },
    [{ name: '篇幅', wording: '800字以内' }]
  )
  assert.ok(p.system.includes('JSON'))
  assert.ok(p.user.includes('写一份汇报'))
  assert.ok(p.user.includes('800字以内'))
})

test('buildDimensionsPrompt：英文路由', () => {
  const p = buildDimensionsPrompt({ text: 'draft a report', images: [], language: 'en' }, [])
  assert.ok(p.system.includes('strict JSON'))
})

test('buildSummaryPrompt：包含约束与撤回约定', () => {
  const p = buildSummaryPrompt({ text: '多轮对话...', images: [], language: 'zh' })
  assert.ok(p.system.includes('JSON'))
  assert.ok(p.user.includes('多轮对话...'))
})

test('estimateTokens：中文按 ~1.5 字/token 粗估', () => {
  const n = estimateTokens('中文字符测试内容'.repeat(100))
  assert.ok(n > 0)
  const n1 = estimateTokens('中文'.repeat(100))
  const n2 = estimateTokens('ab'.repeat(100))
  // 中文单位 token 数应大于等长英文
  assert.ok(n1 > n2)
})

test('chunkText：长文本切分为不超窗口的块', () => {
  const text = '段落。'.repeat(5000) // 15000 字
  const chunks = chunkText(text, 12000)
  assert.ok(chunks.length >= 2)
  for (const c of chunks) assert.ok(c.length <= 12000)
  assert.equal(chunks.join('').length, text.length)
})

test('chunkText：短文本不切分', () => {
  assert.deepEqual(chunkText('短文本', 12000), ['短文本'])
})

test('truncateKeepHeadTail：超长文本保留头尾', () => {
  const text = 'A'.repeat(1000)
  const out = truncateKeepHeadTail(text, 200)
  assert.ok(out.length <= 200)
  assert.ok(out.startsWith('A'))
  assert.ok(out.endsWith('A'))
  assert.ok(out.includes('省略'))
})
