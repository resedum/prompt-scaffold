import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JsonParser } from '../src/main/ai/parse'

test('stripCodeFence：剥除 markdown 代码块', () => {
  const raw = '```json\n{"a":1}\n```'
  assert.equal(JsonParser.stripCodeFence(raw), '{"a":1}')
})

test('stripCodeFence：剥离 JSON 之外的说明文字', () => {
  const raw = '好的，结果如下：\n{"dimensions":[{"name":"篇幅","wording":"控制在800字"}]}\n希望有帮助'
  assert.ok(JsonParser.stripCodeFence(raw).startsWith('{'))
  assert.ok(JsonParser.stripCodeFence(raw).endsWith('}'))
})

test('parseDimensions：解析对象结构', () => {
  const r = JsonParser.parseDimensions('{"dimensions":[{"name":"语气","wording":"正式"}]}')
  assert.equal(r.dimensions.length, 1)
  assert.equal(r.dimensions[0].name, '语气')
  assert.equal(r.dimensions[0].wording, '正式')
})

test('parseDimensions：兼容纯数组输入', () => {
  const r = JsonParser.parseDimensions('[{"name":"a","wording":"b"},{"name":"c","wording":"d"}]')
  assert.equal(r.dimensions.length, 2)
})

test('parseDimensions：非法 JSON 抛 PARSE_ERROR', () => {
  assert.throws(() => JsonParser.parseDimensions('not json at all'), /PARSE_ERROR|JSON/)
})

test('parseDimensions：过滤空条目', () => {
  const r = JsonParser.parseDimensions('{"dimensions":[{"name":"","wording":""},{"name":"x","wording":"y"}]}')
  assert.equal(r.dimensions.length, 1)
})

test('parseSummary：解析完整结构', () => {
  const raw = JSON.stringify({
    summary: { goal: '写报告', conclusions: ['结论1'], constraints: ['约束1'], open: ['待确认'] },
    dimensions: [{ name: '篇幅', wording: '800字' }]
  })
  const r = JsonParser.parseSummary(raw)
  assert.equal(r.summary.goal, '写报告')
  assert.deepEqual(r.summary.conclusions, ['结论1'])
  assert.equal(r.dimensions.length, 1)
})

test('parseSummary：summary 缺失时用根对象兜底', () => {
  const r = JsonParser.parseSummary('{"goal":"目标","constraints":["c1"],"conclusions":[],"open":[]}')
  assert.equal(r.summary.goal, '目标')
  assert.deepEqual(r.summary.constraints, ['c1'])
})
