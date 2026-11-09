/**
 * 规则 + 硬编码维度池兜底（PRD v5 §7 核心，架构师未覆盖）。
 * 纯函数、零依赖，可被 node:test 直接单测。
 *
 * 设计原则：
 * - 按输入关键词推断 category（inferCategory），返回该 category 的预置维度。
 * - 每条维度含 name + wording；wording 为「可直接采用或修改」的具体措辞，
 *   用户未提供的信息一律用「待补：xxx」占位，不替用户编造（交互原则：不编造）。
 */
import type { Dimension, ErrorCode, IpcResult, GenerateDimensionsResponse } from '../../shared/types'

export type CategoryId =
  | 'writing'
  | 'coding'
  | 'research'
  | 'data'
  | 'marketing'
  | 'operations'
  | 'creative'

export interface CategoryPreset {
  id: CategoryId
  labelZh: string
  labelEn: string
  dimensions: Dimension[]
}

export const DIMENSION_POOL: CategoryPreset[] = [
  {
    id: 'writing',
    labelZh: '写作 / 文档',
    labelEn: 'Writing',
    dimensions: [
      { name: '目标读者', wording: '目标读者为「待补：如 老板 / 客户 / 技术同事」，请据此调整语气与详略。' },
      { name: '体裁', wording: '文体采用「待补：报告 / 邮件 / 通知 / 方案」，语言正式度与结构依此对齐。' },
      { name: '篇幅', wording: '篇幅控制在「待补：如 800 字 / 一页 A4」以内，超出部分折叠到附录。' },
      { name: '语气', wording: '整体语气为「待补：正式 / 口语 / 坚定 / 缓和」，保持前后一致。' },
      { name: '结构', wording: '按「结论先行 → 分点论证 → 行动项」组织，每段首句给出结论。' },
      { name: '引用与数据', wording: '涉及数据/引文需注明来源，缺失处标「待补：来源」。' },
      { name: '格式', wording: '标题层级不超过 3 级；字体与行距按「待补：宋体小四 / 1.5 倍行距」。' },
      { name: '术语', wording: '关键术语首次出现时给出定义或括注，避免读者歧义。' },
      { name: '合规', wording: '涉及敏感表述做合规提示，不替用户下结论。' },
      { name: '收尾', wording: '结尾给出明确的下一步行动（谁、何时、做什么）。' }
    ]
  },
  {
    id: 'coding',
    labelZh: '编程',
    labelEn: 'Coding',
    dimensions: [
      { name: '语言与版本', wording: '目标语言/运行时为「待补：如 Python 3.12 / Node 20」，输入输出需明确。' },
      { name: '目标', wording: '实现「待补：功能点」，请先一句话说明它要解决的问题。' },
      { name: '约束', wording: '遵守「待补：框架/库限制」，不引入额外重依赖。' },
      { name: '代码风格', wording: '遵循「待补：如 Google 风格 / 项目已有规范」，命名清晰。' },
      { name: '错误处理', wording: '边界条件与异常需显式处理，并给出可读的错误提示信息。' },
      { name: '测试', wording: '关键路径补充单元测试，并说明覆盖了哪些点。' },
      { name: '性能', wording: '说明时间/空间复杂度，标注可优化点。' },
      { name: '安全', wording: '不硬编码密钥，所有输入做校验与转义。' },
      { name: '兼容性', wording: '说明支持的平台/版本与降级策略。' },
      { name: '交付', wording: '给出可直接运行的完整代码 + 运行方式说明。' }
    ]
  },
  {
    id: 'research',
    labelZh: '研究 / 调研',
    labelEn: 'Research',
    dimensions: [
      { name: '研究问题', wording: '核心研究问题为「待补」，范围需明确界定。' },
      { name: '方法', wording: '采用「待补：文献综述 / 访谈 / 问卷 / 实验」方法。' },
      { name: '来源要求', wording: '优先「待补：近三年 / 权威期刊 / 一手数据」来源。' },
      { name: '样本/范围', wording: '研究对象与样本为「待补」，说明抽样方式。' },
      { name: '对比基准', wording: '与「待补：对照组 / 基线方法」做对比，说明为何选它。' },
      { name: '假设与局限', wording: '明确列出假设与已知局限，不夸大结论。' },
      { name: '结论形式', wording: '结论按「证据 → 判断 → 建议」组织。' },
      { name: '引用格式', wording: '引用按「待补：APA / GB/T 7714」格式。' },
      { name: '反方观点', wording: '纳入反面证据与替代解释，避免片面。' },
      { name: '可复用产出', wording: '产出一份可复查的方法与数据清单。' }
    ]
  },
  {
    id: 'data',
    labelZh: '数据分析',
    labelEn: 'Data',
    dimensions: [
      { name: '数据来源', wording: '数据来源为「待补」，含字段说明与时间范围。' },
      { name: '数据质量', wording: '说明缺失值、异常值的处理方式。' },
      { name: '目标指标', wording: '核心指标为「待补」，给出口径定义与计算公式。' },
      { name: '统计方法', wording: '采用「待补：描述统计 / 回归 / 聚类」方法，并说明适用前提。' },
      { name: '可视化', wording: '图表类型按「待补：折线 / 柱状 / 热力图」，标注单位与坐标轴。' },
      { name: '结论边界', wording: '区分相关与因果，不夸大结论。' },
      { name: '复现性', wording: '附数据处理脚本与随机种子，保证可复现。' },
      { name: '敏感性', wording: '对关键假设做敏感性检验，说明结果稳健性。' },
      { name: '隐私', wording: '涉及个人数据做脱敏与合规说明。' },
      { name: '交付格式', wording: '交付「待补：CSV / 报表 / 看板」。' }
    ]
  },
  {
    id: 'marketing',
    labelZh: '营销 / 推广',
    labelEn: 'Marketing',
    dimensions: [
      { name: '目标人群', wording: '目标用户为「待补」，说明画像与核心痛点。' },
      { name: '核心卖点', wording: '一句话卖点为「待补」，全篇围绕它展开。' },
      { name: '渠道', wording: '投放渠道为「待补：公众号 / 短视频 / 社群」。' },
      { name: '钩子', wording: '开头 3 秒钩子为「待补」，避免夸大。' },
      { name: '行动号召', wording: '明确 CTA「待补：关注 / 点击 / 购买」。' },
      { name: '预算与周期', wording: '预算「待补」，周期「待补」，给出 ROI 预估。' },
      { name: '合规', wording: '广告语避免绝对化用语，标注必要免责。' },
      { name: '竞品参照', wording: '对标「待补」，突出差异而非贬低竞品。' },
      { name: '数据衡量', wording: '定义成功指标「待补：曝光 / 转化 / 留存」。' },
      { name: '版本', wording: '给出 2–3 个备选版本供 A/B 测试。' }
    ]
  },
  {
    id: 'operations',
    labelZh: '运营 / 管理 / 流程',
    labelEn: 'Operations',
    dimensions: [
      { name: '目标与现状', wording: '目标为「待补」，现状基线为「待补」。' },
      { name: '责任人', wording: '负责人与协作人为「待补」，明确 RACI。' },
      { name: '时间节点', wording: '关键里程碑与截止日为「待补」。' },
      { name: '资源', wording: '所需资源（人/钱/物）为「待补」。' },
      { name: '风险', wording: '列出 TOP3 风险与应对预案。' },
      { name: '衡量', wording: '成功标准与复盘周期为「待补」。' },
      { name: '流程', wording: '按「输入 → 步骤 → 输出」拆解，标注卡点。' },
      { name: '沟通', wording: '同步机制与频率为「待补」。' },
      { name: '降级方案', wording: '主方案失败时的 Plan B 为「待补」。' },
      { name: '遗留事项', wording: '明确暂不做的范围，避免范围蔓延。' }
    ]
  },
  {
    id: 'creative',
    labelZh: '创意 / 设计',
    labelEn: 'Creative',
    dimensions: [
      { name: '主题/概念', wording: '核心概念为「待补」，请一句话概括。' },
      { name: '受众与情绪', wording: '目标受众「待补」，希望唤起的情绪「待补」。' },
      { name: '风格参考', wording: '风格参考「待补」，附样例或具体描述。' },
      { name: '媒介/形式', wording: '媒介为「待补：海报 / 视频 / 文案 / UI」。' },
      { name: '尺寸/规格', wording: '尺寸与规格为「待补」，注意平台要求。' },
      { name: '色彩与字体', wording: '主色调「待补」，字体「待补」。' },
      { name: '禁忌', wording: '避免「待补」元素与敏感话题。' },
      { name: '差异化', wording: '与「待补」区分的独特切入点。' },
      { name: '数量', wording: '产出「待补：3 个方向」供选择。' },
      { name: '交付', wording: '交付格式与分辨率「待补」。' }
    ]
  }
]

/** 每个 category 的关键词（中英文均可），用于确定性粗筛 */
const KEYWORDS: Record<CategoryId, string[]> = {
  coding: [
    '代码', '函数', 'bug', '接口', 'api', 'python', 'javascript', 'java', 'golang', 'rust',
    'sql', '前端', '后端', '数据库', '算法', '编程', '程序', '报错', 'debug', '脚本',
    '组件', 'react', 'vue', 'typescript', 'node', '部署', 'docker', '编译',
    '开发', '登录', '注册', '功能', '系统', '模块', '搭建', '网站', '小程序', '实现',
    '编码', '调试', '重构', '架构', '服务', '配置', '安装', '依赖',
    'build', 'develop', 'login', 'signup', 'app'
  ],
  data: [
    '数据', '分析', '统计', '图表', '报表', 'excel', 'csv', '指标', '回归', '聚类',
    '可视化', '清洗', '透视', '取数', '大屏', 'bi', 'dashboard', 'sql', '建模',
    '数据清洗', '数据挖掘', '数仓', '维度', '度量', 'data', 'analysis', 'analyze', 'dataset'
  ],
  research: [
    '研究', '调研', '文献', '论文', '综述', '访谈', '问卷', '实验', '样本', '假设',
    '引用', '学术', '论证', '报告', '方法论', 'research', '课题', '资料', '深度',
    'literature', 'survey'
  ],
  marketing: [
    '营销', '推广', '广告', '文案', '卖点', '用户增长', '投放', '公众号', '短视频',
    '社群', '转化', '引流', '品牌', 'campaign', '获客', '促销', '裂变', '种草',
    '推文', '带货', '直播', '小红书', '抖音', '微博', 'seo', '增长', '涨粉', '私域'
  ],
  operations: [
    '运营', '流程', '项目', '计划', '排期', '管理', '团队', '协作', '周报', '复盘',
    'kpi', 'okr', '里程碑', '会议', 'sop', '制度', '考核', '规划', '执行',
    '推进', '落地', '协调', '日报', '例会', '任务', '日程', '安排'
  ],
  creative: [
    '设计', '海报', '创意', '配色', '字体', 'ui', 'ux', '视觉', 'logo', '插画',
    '视频脚本', '故事', '风格', '灵感', 'banner', '封面', 'icon', '动画',
    '构图', '画面', '主题', '手绘', '排版'
  ],
  writing: [
    '写', '文章', '文档', '邮件', '通知', '方案', '报告', '总结', '汇报', '演讲稿',
    '简历', '文案', '润色', '改写', '标题', '提纲', '要点', '措辞'
  ]
}

/**
 * 按关键词命中数推断 category。
 * 权重：长词(≥4字)为强信号=3，中词(2–3字)=2，单字=1。
 * 决胜：同分时优先非 writing 类别（writing 是默认兜底，避免弱信号「写」抢断强信号类别）；
 * 仅当所有类别均 0 分才回落 writing。
 */
export function inferCategory(text: string): CategoryId {
  const lower = text.toLowerCase()
  let best: CategoryId = 'writing'
  let bestScore = 0
  for (const cat of DIMENSION_POOL) {
    let score = 0
    const kws = KEYWORDS[cat.id] ?? []
    for (const kw of kws) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.length >= 4 ? 3 : kw.length >= 2 ? 2 : 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = cat.id
    } else if (score === bestScore && score > 0 && best === 'writing' && cat.id !== 'writing') {
      best = cat.id
    }
  }
  return best
}

/**
 * 生成维度出错时的决策（纯函数，便于单测）：
 * - VISION_UNSUPPORTED / 非法 key 的 NO_KEY → 走 fail（{ok:false,code}），让 UI 引导换模型/去配置；
 * - 其余（超时/模型错误/空结果/解析失败）→ 规则兜底（{ok:true, source:'fallback'}）。
 */
export function resolveGenerateError(
  errCode: string,
  errMessage: string,
  text: string
): IpcResult<GenerateDimensionsResponse> {
  if (errCode === 'VISION_UNSUPPORTED' || errCode === 'NO_KEY') {
    return { ok: false, code: errCode as ErrorCode, message: errMessage }
  }
  const reason = errCode === 'EMPTY_RESULT' ? 'EMPTY_RESULT' : 'REQUEST_FAILED'
  return {
    ok: true,
    data: {
      dimensions: generateFallbackDimensions(text),
      source: 'fallback',
      fallbackReason: reason
    }
  }
}

/** 无 key / 请求失败时的规则兜底：返回该 category 的预置维度（拷贝，避免外部修改） */
export function generateFallbackDimensions(text: string): Dimension[] {
  const cat = inferCategory(text)
  const preset = DIMENSION_POOL.find((c) => c.id === cat)
  return (preset?.dimensions ?? []).map((d) => ({ name: d.name, wording: d.wording }))
}
