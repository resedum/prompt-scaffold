/**
 * 跨进程共享数据类型（纯类型定义，主进程 / preload / 渲染进程双向引用）。
 * 契约与 ARCHITECTURE §6 保持一致，并补充 PRD v5 增量所需的字段。
 */

/** 单条维度：维度名 + 可直接采用或修改的具体措辞 */
export interface Dimension {
  name: string;
  wording: string;
}

/** 记忆来源：ai-adopted=AI 提议+用户采纳；imported=导入；manual=手动（预留，MVP 不用） */
export type MemoryHabitSource = 'ai-adopted' | 'imported' | 'manual';

/** 记忆条目（ARCHITECTURE v2 §2.1）：Dimension 超集，含来源与时间戳 */
export interface MemoryHabit extends Dimension {
  source: MemoryHabitSource;
  /** ISO 8601 UTC */
  createdAt: string;
  /** ISO 8601 UTC */
  updatedAt: string;
}

/** 对话总结结构 */
export interface Summary {
  goal: string;
  conclusions: string[];
  constraints: string[];
  open: string[];
}

export interface DimensionResult {
  dimensions: Dimension[];
}

export interface SummaryResult {
  summary: Summary;
  dimensions: Dimension[];
}

/** 图片数据（dataURL 形式，跨进程可序列化） */
export interface ImageData {
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
}

/** 选区矩形（物理/逻辑像素坐标） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 模型配置（用户自选 base_url / api_key / model） */
export interface ModelConfig {
  presetId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
}

export interface UiPrefs {
  windowBounds?: Rect;
  theme: 'light' | 'dark';
  trayEnabled: boolean;
}

export type Language = 'zh' | 'en';

/**
 * 用户偏好：四类记忆（模型 / 语言 / 界面 / 维度措辞）。
 * dimensionHabits 仅「AI 提议 + 用户采纳」才写入，无自动采集；导入属用户显式操作。
 * 字段名沿用 dimensionHabits，但类型升级为 MemoryHabit[]（含来源+时间戳），旧数据加载时自动迁移。
 */
export interface Preferences {
  model: ModelConfig;
  language: Language;
  ui: UiPrefs;
  dimensionHabits: MemoryHabit[];
}

/** 生成输入：文字 + 可选图片 + 语言 */
export interface GenerateInput {
  text: string;
  images: ImageData[];
  language: Language;
}

/** 维度来源：ai = 模型生成；fallback = 规则兜底（不冒充 AI） */
export type DimensionSource = 'ai' | 'fallback';

/** 生成维度返回：携带来源标记与兜底原因，供 UI 做视觉区分 */
export interface GenerateDimensionsResponse {
  dimensions: Dimension[];
  source: DimensionSource;
  fallbackReason?: string;
}

/** OpenAI 兼容聊天消息内容片段 */
export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

/** OpenAI 兼容聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

/** 错误码枚举（共享知识 §10.5 + ARCHITECTURE v2 §6） */
export type ErrorCode =
  | 'NO_KEY'
  | 'TIMEOUT'
  | 'MODEL_ERROR'
  | 'VISION_UNSUPPORTED'
  | 'SCREENSHOT_FAILED'
  | 'EMPTY_RESULT'
  | 'PARSE_ERROR'
  | 'FILE_READ_ERROR'
  | 'CLIPBOARD_EMPTY'
  | 'IMPORT_INVALID'
  | 'EXPORT_FAILED'
  | 'SHARE_FETCH_FAILED'
  | 'CANCELLED'
  | 'PRIVACY_DENIED'
  | 'NOT_FOUND'
  | 'SANDBOX_TIMEOUT'
  | 'SANDBOX_FAILED'
  | 'BACKUP_FAILED'
  | 'EXTRACT_UNSUPPORTED'
  | 'VERSION_NOT_FOUND';

/** IPC 统一返回结构：{ ok:true, data } | { ok:false, code, message } */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

/** 记忆导出结果 */
export interface MemoryExportResult {
  count: number;
  canceled: boolean;
}

/** 记忆导入预览（选文件 + 解析后，尚未落盘） */
export interface MemoryImportPreview {
  fileName: string;
  /** 归一化后的合法条目（源=imported） */
  habits: MemoryHabit[];
  /** 合法条数 */
  total: number;
  /** 与现有 dimensionHabits 同名的条数 */
  conflictCount: number;
  /** 被跳过的非法条数 */
  invalidCount: number;
}

export type MemoryImportStrategy = 'merge' | 'overwrite';

export interface MemoryImportApplyArgs {
  habits: MemoryHabit[];
  strategy: MemoryImportStrategy;
}

export interface MemoryImportResult {
  habits: MemoryHabit[];
  added: number;
  overwritten: number;
}
