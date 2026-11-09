import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inferCategory,
  generateFallbackDimensions,
  resolveGenerateError,
  DIMENSION_POOL
} from '../src/main/ai/fallback'

test('维度池：7 个 category，各 8–15 条，每条含 name+wording', () => {
  assert.equal(DIMENSION_POOL.length, 7)
  for (const cat of DIMENSION_POOL) {
    assert.ok(cat.dimensions.length >= 8 && cat.dimensions.length <= 15, `${cat.id} 维度数异常`)
    for (const d of cat.dimensions) {
      assert.ok(typeof d.name === 'string' && d.name.length > 0, 'name 非空')
      assert.ok(typeof d.wording === 'string' && d.wording.length > 0, 'wording 非空')
    }
  }
})

test('inferCategory：按关键词推断', () => {
  assert.equal(inferCategory('帮我写一篇关于 AI 的文章'), 'writing')
  assert.equal(inferCategory('写一个 Python 函数处理数据'), 'coding')
  assert.equal(inferCategory('分析这份 Excel 数据报表'), 'data')
  assert.equal(inferCategory('做一份营销推广文案'), 'marketing')
  assert.equal(inferCategory('帮我做项目排期和团队协作计划'), 'operations')
  assert.equal(inferCategory('设计一张海报配色'), 'creative')
  assert.equal(inferCategory('写一篇论文文献综述'), 'research')
})

test('inferCategory：无命中默认 writing', () => {
  assert.equal(inferCategory('今天天气不错'), 'writing')
})

test('inferCategory：补齐关键词后中英分类正确（QA BUG-1）', () => {
  assert.equal(inferCategory('开发登录'), 'coding')
  assert.equal(inferCategory('data analysis'), 'data')
  assert.equal(inferCategory('写一篇公众号推文'), 'marketing')
  assert.equal(inferCategory('写报告'), 'writing')
})

test('resolveGenerateError：VISION_UNSUPPORTED/NO_KEY 走 fail，其余走兜底（QA BUG-2）', () => {
  const v = resolveGenerateError('VISION_UNSUPPORTED', '不支持图片', '文本')
  assert.equal(v.ok, false)
  if (!v.ok) assert.equal(v.code, 'VISION_UNSUPPORTED')

  const k = resolveGenerateError('NO_KEY', 'key 无效', '文本')
  assert.equal(k.ok, false)
  if (!k.ok) assert.equal(k.code, 'NO_KEY')

  const t = resolveGenerateError('TIMEOUT', '超时', '写报告')
  assert.equal(t.ok, true)
  if (t.ok) {
    assert.equal(t.data.source, 'fallback')
    assert.equal(t.data.fallbackReason, 'REQUEST_FAILED')
    assert.ok(t.data.dimensions.length > 0)
  }
})

test('generateFallbackDimensions：返回可采用的维度拷贝', () => {
  const dims = generateFallbackDimensions('帮我写一篇季度汇报')
  assert.ok(dims.length > 0)
  for (const d of dims) {
    assert.ok(d.name && d.wording)
  }
  // 措辞应包含「待补」占位或具体建议，不应是单个词
  const joined = dims.map((d) => d.wording).join('')
  assert.ok(joined.length > 20)
})
