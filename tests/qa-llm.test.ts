/**
 * QA 独立补充测试：LLMProvider 的 key 判定 + 无 key / 视觉不支持错误路径。
 * 覆盖硬约束 #6（视觉不支持降级）在 LLM 层的落点。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LLMProvider } from '../src/main/ai/llm'
import type { ModelConfig, ImageData } from '../src/shared/types'

function cfg(partial: Partial<ModelConfig> = {}): ModelConfig {
  return {
    presetId: 'deepseek',
    baseUrl: '',
    apiKey: '',
    model: 'deepseek-chat',
    visionModel: '',
    ...partial
  }
}

const img: ImageData = { dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', width: 1, height: 1 }

test('QA·hasKey：无 key 且非 ollama → false', () => {
  assert.equal(new LLMProvider(cfg()).hasKey(), false)
})

test('QA·hasKey：ollama 本地预设无需 key → true', () => {
  assert.equal(new LLMProvider(cfg({ presetId: 'ollama' })).hasKey(), true)
})

test('QA·hasKey：有 key → true', () => {
  assert.equal(new LLMProvider(cfg({ apiKey: 'sk-xxx' })).hasKey(), true)
})

test('QA·无 key 时 generateDimensions 抛 NO_KEY（不触网）', async () => {
  const p = new LLMProvider(cfg())
  await assert.rejects(
    p.generateDimensions({ text: '写报告', images: [], language: 'zh' }),
    (e: unknown) => (e as { code?: string })?.code === 'NO_KEY'
  )
})

test('QA·有图片但未配置视觉模型 → VISION_UNSUPPORTED', async () => {
  const p = new LLMProvider(cfg({ apiKey: 'sk-xxx', visionModel: '' }))
  await assert.rejects(
    p.generateDimensions({ text: '看图', images: [img], language: 'zh' }),
    (e: unknown) => (e as { code?: string })?.code === 'VISION_UNSUPPORTED'
  )
})

test('QA·无 key 时 summarizeConversation 抛 NO_KEY', async () => {
  const p = new LLMProvider(cfg())
  await assert.rejects(
    p.summarizeConversation({ text: '多轮对话', images: [], language: 'zh' }),
    (e: unknown) => (e as { code?: string })?.code === 'NO_KEY'
  )
})
