/**
 * 预设、限制常量、错误码等共享常量。
 * 主进程与渲染进程共用，避免散落魔法值。
 */
import type { ModelConfig } from './types'

export const APP_NAME = 'Prompt Scaffold'
export const APP_ID = 'com.promptscaffold.app'

export interface ModelPreset {
  id: string
  label: string
  baseUrl: string
  model: string
  visionModel: string
  needsKey: boolean
}

/** 多模型预设（智谱 / DeepSeek / Ollama / 自定义） */
export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    visionModel: 'glm-4v-flash',
    needsKey: true
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    visionModel: '',
    needsKey: true
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    visionModel: 'llava',
    needsKey: false
  },
  {
    id: 'custom',
    label: '自定义',
    baseUrl: '',
    model: '',
    visionModel: '',
    needsKey: true
  }
]

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  presetId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  visionModel: ''
}

/** 长文本处理限制（ARCHITECTURE §1.6） */
export const MAX_TEXT_CHARS = 64000 // 输入硬上限
export const SUMMARIZE_CHUNK_CHARS = 12000 // 分段总结窗口
export const SUMMARIZE_TOKEN_BUDGET = 6000 // 单次总结的 token 预算

/** 请求超时（毫秒） */
export const REQUEST_TIMEOUT_MS = 60000

/** 存储落盘防抖（毫秒，ARCHITECTURE §10.4） */
export const STORAGE_DEBOUNCE_MS = 300

/** 存储写失败后的单次重试间隔（毫秒，ARCHITECTURE v2 §1.2） */
export const STORAGE_RETRY_MS = 1000

/** 静默期：连续忽略提醒 N 次后不再主动弹提醒（PRD v5 §4） */
export const SILENCE_IGNORE_THRESHOLD = 3
export const SILENCE_STORAGE_KEY = 'prompt-scaffold.silence-ignores'

/** 记忆库导入/导出（ARCHITECTURE v2 §5） */
export const MEMORY_EXPORT_VERSION = 1
export const MEMORY_IMPORT_MAX_BYTES = 5 * 1024 * 1024 // 5MB
export const MEMORY_IMPORT_MAX_ITEMS = 1000

/** 分享链接抓取（ARCHITECTURE v2 §3.2） */
export const SHARE_FETCH_TIMEOUT_MS = 15000
export const SHARE_FETCH_POLL_MS = 400
export const SHARE_FETCH_MIN_TEXT_CHARS = 120
