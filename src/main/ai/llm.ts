/**
 * LLMProvider：OpenAI 兼容客户端封装（ARCHITECTURE §6.2）。
 * - 文本/视觉模型统一走 chat.completions，图片以 image_url base64 传入 content 数组。
 * - JSON mode + 容错解析（parse.ts）。
 * - 长文本三段式降级：截断 → 分段总结 → 硬上限（§1.6）。
 * - 错误归一化：401/403→NO_KEY、超时→TIMEOUT、图片不支持→VISION_UNSUPPORTED、其余→MODEL_ERROR。
 */
import OpenAI from 'openai'
import type {
  ChatMessage,
  ChatContentPart,
  GenerateInput,
  Dimension,
  SummaryResult,
  ModelConfig
} from '../../shared/types'
import { REQUEST_TIMEOUT_MS, MAX_TEXT_CHARS, SUMMARIZE_CHUNK_CHARS, SUMMARIZE_TOKEN_BUDGET } from '../../shared/constants'
import { buildDimensionsPrompt, buildSummaryPrompt, estimateTokens, chunkText } from './prompts'
import { JsonParser } from './parse'

export class AppError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming

export class LLMProvider {
  private config: ModelConfig
  private client: OpenAI | null = null
  private currentModel = ''

  constructor(config: ModelConfig) {
    this.config = config
  }

  setConfig(cfg: ModelConfig): void {
    this.config = cfg
    this.client = null
  }

  /** Ollama 等本地预设无需 key */
  hasKey(): boolean {
    if (this.config.presetId === 'ollama') return true
    return (this.config.apiKey ?? '').trim().length > 0
  }

  private getClient(): OpenAI {
    if (this.client) return this.client
    this.client = new OpenAI({
      apiKey: this.config.apiKey?.trim() || 'EMPTY_KEY',
      baseURL: this.config.baseUrl?.trim() || undefined,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1
    })
    return this.client
  }

  /** 组装消息：图片拼进最后一条 user 消息的 content 数组 */
  private buildMessages(input: GenerateInput, system: string, user: string): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: 'system', content: system }]
    if (input.images && input.images.length > 0) {
      const parts: ChatContentPart[] = [{ type: 'text', text: user }]
      for (const img of input.images) {
        parts.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'auto' } })
      }
      messages.push({ role: 'user', content: parts })
    } else {
      messages.push({ role: 'user', content: user })
    }
    return messages
  }

  async generateDimensions(input: GenerateInput, habits: Dimension[] = []): Promise<Dimension[]> {
    if (!this.hasKey()) throw new AppError('NO_KEY', '未配置 API Key')
    if (input.images.length > 0) {
      if (!this.config.visionModel?.trim()) {
        throw new AppError('VISION_UNSUPPORTED', '未配置视觉模型，无法识别图片')
      }
      this.currentModel = this.config.visionModel.trim()
    } else {
      if (!this.config.model?.trim()) {
        throw new AppError('MODEL_ERROR', '未配置文本模型名称（请到「模型设置」填写 model）')
      }
      this.currentModel = this.config.model.trim()
    }
    const prompt = buildDimensionsPrompt(input, habits)
    const messages = this.buildMessages(input, prompt.system, prompt.user)
    const raw = await this.chat(messages, true)
    const result = JsonParser.parseDimensions(raw)
    if (result.dimensions.length === 0) {
      throw new AppError('EMPTY_RESULT', '模型未返回有效维度')
    }
    return result.dimensions
  }

  /** 通用纯文本补全（记忆工具总结/增强等复用），返回纯文本非 JSON */
  async completeText(system: string, user: string): Promise<string> {
    if (!this.hasKey()) throw new AppError('NO_KEY', '未配置 API Key')
    if (!this.config.model?.trim()) {
      throw new AppError('MODEL_ERROR', '未配置文本模型名称')
    }
    this.currentModel = this.config.model.trim()
    const raw = await this.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      false
    )
    if (!raw || !raw.trim()) throw new AppError('EMPTY_RESULT', '模型未返回内容')
    return raw
  }

  async summarizeConversation(input: GenerateInput): Promise<SummaryResult> {
    if (!this.hasKey()) throw new AppError('NO_KEY', '未配置 API Key')
    if (input.text.length > MAX_TEXT_CHARS) {
      throw new AppError('MODEL_ERROR', `文本超过硬上限 ${MAX_TEXT_CHARS} 字符`)
    }
    if (!this.config.model?.trim()) {
      throw new AppError('MODEL_ERROR', '未配置文本模型名称（请到「模型设置」填写 model）')
    }
    this.currentModel = this.config.model.trim()

    let text = input.text
    // 第二级：超 token 预算 → 分段压缩（map-reduce）
    if (estimateTokens(text) > SUMMARIZE_TOKEN_BUDGET) {
      text = await this.condense(text)
    }
    const prompt = buildSummaryPrompt({ ...input, text })
    const messages = this.buildMessages({ ...input, text, images: [] }, prompt.system, prompt.user)
    const raw = await this.chat(messages, true)
    return JsonParser.parseSummary(raw)
  }

  /** 分段总结：逐块压缩后合并 */
  private async condense(text: string): Promise<string> {
    const chunks = chunkText(text, SUMMARIZE_CHUNK_CHARS)
    if (chunks.length <= 1) return text
    const parts: string[] = []
    for (const c of chunks) {
      const raw = await this.chat(
        [
          {
            role: 'system',
            content:
              '请压缩下面这段对话，保留所有仍有效的目标、约束、已撤回标记与关键事实，输出简洁要点，不要编造。'
          },
          { role: 'user', content: c }
        ],
        false
      )
      parts.push(raw)
    }
    const merged = parts.join('\n')
    // 若压缩后仍超预算，做一次硬截断（保留头尾）
    if (estimateTokens(merged) > SUMMARIZE_TOKEN_BUDGET) {
      return merged.slice(0, MAX_TEXT_CHARS)
    }
    return merged
  }

  private async chat(messages: ChatMessage[], jsonMode: boolean): Promise<string> {
    const client = this.getClient()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const params = {
        model: this.currentModel,
        messages: messages as ChatParams['messages'],
        temperature: 0.2,
        max_tokens: 2048
      } as ChatParams
      if (jsonMode) {
        params.response_format = { type: 'json_object' }
      }
      const resp = await client.chat.completions.create(params, { signal: controller.signal })
      const content = resp.choices?.[0]?.message?.content
      if (!content || !content.trim()) {
        throw new AppError('EMPTY_RESULT', '模型未返回内容')
      }
      return content
    } catch (err) {
      // 部分厂商不支持 response_format，退化重试一次
      if (jsonMode && isResponseFormatError(err)) {
        return this.chat(messages, false)
      }
      throw mapError(err)
    } finally {
      clearTimeout(timer)
    }
  }
}

function isResponseFormatError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase()
  const status = (err as { status?: number })?.status
  return status === 400 && /response_format|json_object|json mode/.test(msg)
}

function mapError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const e = err as {
    name?: string
    code?: string
    status?: number
    message?: string
  }
  if (e?.name === 'AbortError' || e?.code === 'ETIMEDOUT' || /timeout|aborted/i.test(String(e?.message ?? ''))) {
    return new AppError('TIMEOUT', '请求超时')
  }
  const status = e?.status
  const msg = String(e?.message ?? '')
  if (status === 401 || status === 403) {
    return new AppError('NO_KEY', 'API Key 无效或未授权')
  }
  if (
    status === 400 &&
    /image|vision|图片|视觉|invalid.*content|content.*type|unsupported.*content/i.test(msg)
  ) {
    return new AppError('VISION_UNSUPPORTED', '当前模型不支持图片输入')
  }
  return new AppError('MODEL_ERROR', msg || '模型调用失败')
}
