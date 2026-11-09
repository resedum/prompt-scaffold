/**
 * QA 独立补充测试：inferCategory 中英分类 + 规则兜底。
 * 覆盖团队验收 C① 的用例，含边界（空输入 / 超长输入 / 无命中）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inferCategory, generateFallbackDimensions, resolveGenerateError } from '../src/main/ai/fallback'

test('QA·分类：写报告 → writing', () => {
  assert.equal(inferCategory('写报告'), 'writing')
})

test('QA·分类：公众号推文 → marketing', () => {
  assert.equal(inferCategory('公众号推文'), 'marketing')
})

test('QA·分类：开发登录 → coding', () => {
  assert.equal(inferCategory('开发登录'), 'coding')
})

test('QA·分类：分析数据 → data', () => {
  assert.equal(inferCategory('分析数据'), 'data')
})

test('QA·分类：英文 python function → coding', () => {
  assert.equal(inferCategory('write a python function'), 'coding')
})

test('QA·分类：英文 data analysis → data', () => {
  assert.equal(inferCategory('data analysis'), 'data')
})

test('QA·分类：英文 marketing campaign → marketing', () => {
  assert.equal(inferCategory('marketing campaign'), 'marketing')
})

test('QA·分类：英文 research paper → research', () => {
  assert.equal(inferCategory('research paper'), 'research')
})

test('QA·分类：无命中 → 兜底 writing', () => {
  assert.equal(inferCategory('今天天气不错'), 'writing')
})

test('QA·分类：空输入不崩 → 兜底 writing', () => {
  assert.equal(inferCategory(''), 'writing')
})

test('QA·分类：超长输入不崩，返回合法 category', () => {
  const cat = inferCategory('a'.repeat(100000))
  const valid = ['writing', 'coding', 'research', 'data', 'marketing', 'operations', 'creative']
  assert.ok(valid.includes(cat), `返回了非法 category: ${cat}`)
})

test('QA·兜底：generateFallbackDimensions 返回维度拷贝，外部修改不影响池', () => {
  const dims = generateFallbackDimensions('分析数据')
  assert.ok(dims.length > 0)
  dims[0].name = 'HACKED'
  const again = generateFallbackDimensions('分析数据')
  assert.notEqual(again[0].name, 'HACKED')
})

test('QA·BUG-2 回归：VISION_UNSUPPORTED 走 fail，不再被吞为兜底', () => {
  const r = resolveGenerateError('VISION_UNSUPPORTED', '当前模型不支持图片', '看图')
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'VISION_UNSUPPORTED')
})

test('QA·BUG-2 回归：非法 key 的 NO_KEY 走 fail', () => {
  const r = resolveGenerateError('NO_KEY', 'API Key 无效', '写报告')
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'NO_KEY')
})

test('QA·BUG-2 回归：TIMEOUT/MODEL_ERROR 仍走规则兜底（不误伤正常请求失败）', () => {
  for (const code of ['TIMEOUT', 'MODEL_ERROR', 'PARSE_ERROR']) {
    const r = resolveGenerateError(code, '请求失败', '写报告')
    assert.equal(r.ok, true, `${code} 应走兜底`)
    if (r.ok) {
      assert.equal(r.data.source, 'fallback')
      assert.equal(r.data.fallbackReason, 'REQUEST_FAILED')
      assert.ok(r.data.dimensions.length > 0)
    }
  }
})

test('QA·BUG-2 回归：EMPTY_RESULT 走兜底且原因标注 EMPTY_RESULT', () => {
  const r = resolveGenerateError('EMPTY_RESULT', '无结果', '写报告')
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.data.source, 'fallback')
    assert.equal(r.data.fallbackReason, 'EMPTY_RESULT')
  }
})
