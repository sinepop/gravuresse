/**
 * Fallback provider metadata and info-merge utility for the Settings UI.
 *
 * FALLBACK_PROVIDER_METADATA provides static links / billing / meta for
 * every known provider so the renderer can render provider cards even when
 * the main process hasn't sent live data yet.
 *
 * providerInfo() merges the fallback data with per-provider and per-track
 * overrides coming from the registry.
 */

// @ts-check

/** @typedef {import('../../types/domain').Track} Track */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{ links: Partial<Record<string, string>>, billing: UnknownRecord, region: string, capabilities: UnknownRecord, constraints: UnknownRecord, customizable: UnknownRecord, description: string, descriptionZh: string, descriptionEn: string, nameZh: string, nameEn: string, relay: boolean }} ProviderInfoResult */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) {
  return isRecord(value) ? value : {}
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {...unknown} values @returns {UnknownRecord} */
function firstRecord(...values) {
  for (const value of values) {
    if (isRecord(value) && Object.keys(value).length > 0) return value
  }
  return {}
}

/* ------------------------------------------------------------------ */
/*  FALLBACK_PROVIDER_METADATA                                        */
/* ------------------------------------------------------------------ */

/** @type {Record<string, UnknownRecord>} */
export const FALLBACK_PROVIDER_METADATA = {
  openai: {
    links: {
      home: 'https://openai.com',
      docs: 'https://developers.openai.com/api/docs/guides/image-generation',
      pricing: 'https://openai.com/api/pricing/',
      purchase: 'https://platform.openai.com/settings/organization/billing/overview',
      console: 'https://platform.openai.com',
      apiKey: 'https://platform.openai.com/api-keys'
    },
    billing: { mode: 'paygo', noteZh: 'API 按量计费，与 ChatGPT 订阅分开。' },
    meta: { region: 'global', nameEn: 'OpenAI', description: 'OpenAI chat and GPT-Image generation.', descriptionZh: 'OpenAI 对话与 GPT-Image 生成。' },
    relayCompatible: true
  },
  google: {
    links: {
      home: 'https://ai.google.dev/gemini-api',
      docs: 'https://ai.google.dev/gemini-api/docs/image-generation',
      pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
      purchase: 'https://aistudio.google.com/usage',
      console: 'https://aistudio.google.com',
      apiKey: 'https://aistudio.google.com/app/apikey'
    },
    billing: { mode: 'paygo', noteZh: 'Gemini API 按量计费，视频调用前请确认价格。' },
    meta: { region: 'global', nameEn: 'Google Gemini', description: 'Gemini chat, Nano Banana image generation, and Veo video metadata.', descriptionZh: 'Gemini 对话、Nano Banana 图像生成及 Veo 视频。' }
  },
  volcengine: {
    links: {
      home: 'https://www.volcengine.com/product/ark',
      docs: 'https://www.volcengine.com/docs/82379/1520757?lang=zh',
      pricing: 'https://www.volcengine.com/docs/82379/1544106?lang=zh',
      purchase: 'https://console.volcengine.com/ark',
      console: 'https://console.volcengine.com/ark',
      apiKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
      jimeng: 'https://www.volcengine.com/product/jimeng'
    },
    billing: { mode: 'credits', noteZh: '火山方舟 API 按官方接口计费。' },
    meta: { region: 'china', nameZh: '火山方舟', nameEn: 'Volcengine ModelArk', description: 'Doubao chat, Seedream image, and Seedance video through Volcengine ModelArk.', descriptionZh: '火山方舟 API，支持豆包对话、Seedream 生图和 Seedance 视频。' },
    relayCompatible: true
  },
  siliconflow: {
    links: {
      home: 'https://www.siliconflow.com',
      docs: 'https://docs.siliconflow.cn/en/api-reference/images/images-generations',
      pricing: 'https://www.siliconflow.com/pricing',
      purchase: 'https://cloud.siliconflow.cn/account/billing',
      console: 'https://cloud.siliconflow.cn',
      apiKey: 'https://cloud.siliconflow.cn/account/ak'
    },
    billing: { mode: 'paygo', noteZh: 'SiliconFlow 按量计费，支持图像模型。' },
    meta: { region: 'both', nameEn: 'SiliconFlow', description: 'Open model inference and image generation.', descriptionZh: '开放模型推理与图像生成。' },
    relayCompatible: true
  },
  alibaba: {
    links: {
      home: 'https://www.alibabacloud.com/product/modelstudio',
      docs: 'https://www.alibabacloud.com/help/en/model-studio/',
      pricing: 'https://www.alibabacloud.com/help/en/model-studio/models',
      purchase: 'https://bailian.console.aliyun.com/',
      console: 'https://bailian.console.aliyun.com',
      apiKey: 'https://bailian.console.aliyun.com'
    },
    billing: { mode: 'paygo', noteZh: 'Qwen OpenAI 兼容对话接口；Wan 媒体请使用 alibaba-wan 入口。' },
    meta: { region: 'china', nameEn: 'Alibaba Qwen', description: 'Qwen OpenAI-compatible chat models.', descriptionZh: '通义千问 OpenAI 兼容对话模型。' }
  },
  'alibaba-wan': {
    links: {
      home: 'https://www.aliyun.com/product/bailian',
      docs: 'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference',
      pricing: 'https://www.alibabacloud.com/help/en/model-studio/models',
      purchase: 'https://bailian.console.aliyun.com',
      console: 'https://bailian.console.aliyun.com',
      apiKey: 'https://bailian.console.aliyun.com'
    },
    billing: { mode: 'paygo', noteZh: '阿里万相 Wan 图像/视频异步任务，各模型约束不同。' },
    meta: { region: 'china', nameZh: '阿里万相', nameEn: 'Alibaba Wan', description: 'Alibaba Bailian Wan image and video generation with direct handlers.', descriptionZh: '阿里百炼 Wan 图像与视频生成。' }
  },
  'baidu-qianfan': {
    links: {
      home: 'https://cloud.baidu.com/product/qianfan.html',
      docs: 'https://cloud.baidu.com/doc/qianfan-api/index.html',
      pricing: 'https://cloud.baidu.com/doc/qianfan-price/index.html',
      purchase: 'https://console.bce.baidu.com/qianfan/ais/console/charge',
      console: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
      apiKey: 'https://console.bce.baidu.com/iam/#/iam/apikey/list'
    },
    billing: { mode: 'paygo', noteZh: '百度千帆图像/视频 API 使用百度 API Key 计费。' },
    meta: { region: 'china', nameZh: '百度千帆', nameEn: 'Baidu Qianfan', description: 'Baidu Qianfan image generation and text-to-video task APIs.', descriptionZh: '百度千帆图像生成与文生视频任务 API。' }
  },
  'tencent-tokenhub': {
    links: {
      home: 'https://cloud.tencent.com/product/tokenhub',
      docs: 'https://cloud.tencent.com/document/product/1823/130081',
      pricing: 'https://cloud.tencent.com/document/product/1823',
      purchase: 'https://buy.cloud.tencent.com',
      console: 'https://console.cloud.tencent.com',
      apiKey: 'https://console.cloud.tencent.com/cam/capi'
    },
    billing: { mode: 'paygo', noteZh: '腾讯混元 TokenHub 使用腾讯云计费。' },
    meta: { region: 'china', nameZh: '腾讯混元', nameEn: 'Tencent TokenHub', description: 'Tencent TokenHub Hunyuan image and video API.', descriptionZh: '腾讯混元 TokenHub 混元图像与视频 API。' }
  },
  deepseek: {
    links: {
      home: 'https://www.deepseek.com/',
      docs: 'https://api-docs.deepseek.com/',
      pricing: 'https://api-docs.deepseek.com/quick_start/pricing',
      purchase: 'https://platform.deepseek.com/usage',
      console: 'https://platform.deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys'
    },
    billing: { mode: 'paygo', noteZh: 'DeepSeek OpenAI 兼容对话接口。' },
    meta: { region: 'both', nameEn: 'DeepSeek', description: 'DeepSeek OpenAI-compatible chat models.', descriptionZh: 'DeepSeek OpenAI 兼容对话模型。' }
  },
  moonshot: {
    links: {
      home: 'https://www.moonshot.cn/',
      docs: 'https://platform.moonshot.cn/docs',
      pricing: 'https://platform.moonshot.cn/docs/pricing',
      purchase: 'https://platform.moonshot.cn/console/account',
      console: 'https://platform.moonshot.cn/console',
      apiKey: 'https://platform.moonshot.cn/console/api-keys'
    },
    billing: { mode: 'paygo', noteZh: 'Moonshot Kimi OpenAI 兼容对话接口。' },
    meta: { region: 'china', nameEn: 'Moonshot', description: 'Kimi chat models.', descriptionZh: 'Kimi 对话模型。' }
  },
  zhipu: {
    links: {
      home: 'https://open.bigmodel.cn/',
      docs: 'https://docs.bigmodel.cn/',
      pricing: 'https://open.bigmodel.cn/pricing',
      purchase: 'https://open.bigmodel.cn/usercenter/account',
      console: 'https://open.bigmodel.cn/usercenter',
      apiKey: 'https://open.bigmodel.cn/usercenter/apikeys'
    },
    billing: { mode: 'paygo', noteZh: '智谱 AI OpenAI 兼容对话接口。' },
    meta: { region: 'china', nameZh: '智谱 AI', nameEn: 'Zhipu AI', description: 'GLM chat models.', descriptionZh: 'GLM 对话模型。' }
  },
  lingyi: {
    links: {
      home: 'https://www.lingyiwanwu.com/',
      docs: 'https://platform.lingyiwanwu.com/docs',
      pricing: 'https://platform.lingyiwanwu.com/pricing',
      purchase: 'https://platform.lingyiwanwu.com/account',
      console: 'https://platform.lingyiwanwu.com/',
      apiKey: 'https://platform.lingyiwanwu.com/apikeys'
    },
    billing: { mode: 'paygo', noteZh: '零一万物 OpenAI 兼容对话接口。' },
    meta: { region: 'china', nameZh: '零一万物', nameEn: '01.AI', description: 'Yi chat models.', descriptionZh: 'Yi 对话模型。' }
  },
  groq: {
    links: {
      home: 'https://groq.com/',
      docs: 'https://console.groq.com/docs/overview',
      pricing: 'https://groq.com/pricing/',
      purchase: 'https://console.groq.com/settings/billing',
      console: 'https://console.groq.com/',
      apiKey: 'https://console.groq.com/keys'
    },
    billing: { mode: 'paygo', noteZh: 'Groq 高速 OpenAI 兼容推理。' },
    meta: { region: 'global', nameEn: 'Groq', description: 'Fast OpenAI-compatible inference.', descriptionZh: '高速 OpenAI 兼容推理。' }
  },
  together: {
    links: {
      home: 'https://www.together.ai/',
      docs: 'https://docs.together.ai/',
      pricing: 'https://www.together.ai/pricing',
      purchase: 'https://api.together.ai/settings/billing',
      console: 'https://api.together.ai/',
      apiKey: 'https://api.together.ai/settings/api-keys'
    },
    billing: { mode: 'paygo', noteZh: 'Together AI 开放模型聚合平台。' },
    meta: { region: 'global', nameEn: 'Together AI', description: 'Open model aggregation platform.', descriptionZh: '开放模型聚合平台。' }
  },
  openrouter: {
    links: {
      home: 'https://openrouter.ai/',
      docs: 'https://openrouter.ai/docs',
      pricing: 'https://openrouter.ai/models',
      purchase: 'https://openrouter.ai/credits',
      console: 'https://openrouter.ai/settings',
      apiKey: 'https://openrouter.ai/settings/keys'
    },
    billing: { mode: 'credits', noteZh: 'OpenRouter 预付费积分模型路由。' },
    meta: { region: 'global', nameEn: 'OpenRouter', description: 'Multi-model OpenAI-compatible router.', descriptionZh: '多模型 OpenAI 兼容路由。' }
  },
  xai: {
    links: {
      home: 'https://x.ai/api',
      docs: 'https://docs.x.ai/docs/overview',
      pricing: 'https://docs.x.ai/docs/models',
      purchase: 'https://console.x.ai/team/default/billing',
      console: 'https://console.x.ai/',
      apiKey: 'https://console.x.ai/team/default/api-keys'
    },
    billing: { mode: 'paygo', noteZh: 'xAI Grok OpenAI 兼容对话接口。' },
    meta: { region: 'global', nameEn: 'xAI Grok', description: 'Grok OpenAI-compatible chat models.', descriptionZh: 'Grok OpenAI 兼容对话模型。' }
  },
  perplexity: {
    links: {
      home: 'https://www.perplexity.ai/',
      docs: 'https://docs.perplexity.ai/',
      pricing: 'https://docs.perplexity.ai/getting-started/pricing',
      purchase: 'https://www.perplexity.ai/settings/api',
      console: 'https://www.perplexity.ai/settings/api',
      apiKey: 'https://www.perplexity.ai/settings/api'
    },
    billing: { mode: 'paygo', noteZh: 'Perplexity AI 搜索与对话接口。' },
    meta: { region: 'global', nameEn: 'Perplexity', description: 'AI search and chat API.', descriptionZh: 'AI 搜索与对话 API。' }
  },
  stability: {
    links: {
      home: 'https://platform.stability.ai',
      docs: 'https://platform.stability.ai/docs/api-reference',
      pricing: 'https://platform.stability.ai/pricing',
      purchase: 'https://platform.stability.ai/account/credits',
      console: 'https://platform.stability.ai',
      apiKey: 'https://platform.stability.ai/account/keys'
    },
    billing: { mode: 'credits', noteZh: 'Stability AI 积分制图像 API。' },
    meta: { region: 'global', nameEn: 'Stability AI', description: 'Stable Image generation API metadata.', descriptionZh: 'Stable Image 图像生成 API。' }
  },
  ideogram: {
    links: {
      home: 'https://ideogram.ai/api',
      docs: 'https://developer.ideogram.ai/ideogram-api/api-overview',
      pricing: 'https://ideogram.ai/api-pricing/',
      purchase: 'https://ideogram.ai/manage-api',
      console: 'https://ideogram.ai',
      apiKey: 'https://ideogram.ai/manage-api'
    },
    billing: { mode: 'paygo', noteZh: 'Ideogram 按生成张数计费。' },
    meta: { region: 'global', nameEn: 'Ideogram', description: 'Ideogram image generation API metadata.', descriptionZh: 'Ideogram 图像生成 API。' }
  },
  runway: {
    links: {
      home: 'https://runwayml.com/en/api',
      docs: 'https://docs.dev.runwayml.com/',
      pricing: 'https://docs.dev.runwayml.com/guides/pricing/',
      purchase: 'https://dev.runwayml.com/billing',
      console: 'https://dev.runwayml.com',
      apiKey: 'https://dev.runwayml.com/api-keys'
    },
    billing: { mode: 'credits', noteZh: 'Runway 使用开发者门户积分，图像/视频按模型定价。' },
    meta: { region: 'global', nameEn: 'Runway', description: 'Runway image metadata and image-to-video handler.', descriptionZh: 'Runway 图像元数据与图生视频处理。' }
  },
  luma: {
    links: {
      home: 'https://lumalabs.ai/api',
      docs: 'https://docs.lumalabs.ai/docs/welcome',
      pricing: 'https://lumalabs.ai/pricing',
      purchase: 'https://lumalabs.ai/dream-machine/api/billing/overview',
      console: 'https://lumalabs.ai/dream-machine/api',
      apiKey: 'https://lumalabs.ai/dream-machine/api/keys'
    },
    billing: { mode: 'credits', noteZh: 'Luma Dream Machine 图像/视频 API，异步请求加轮询。' },
    meta: { region: 'global', nameEn: 'Luma AI', description: 'Luma Dream Machine image and video API metadata.', descriptionZh: 'Luma Dream Machine 图像与视频 API。' }
  },
  minimax: {
    links: {
      home: 'https://www.minimax.io/',
      docs: 'https://platform.minimax.io/docs/api-reference/video-generation-t2v',
      pricing: 'https://platform.minimax.io/docs/pricing/overview',
      purchase: 'https://platform.minimax.io/docs/guides/pricing-video',
      console: 'https://platform.minimax.io',
      apiKey: 'https://platform.minimax.io/docs/guides/quickstart-preparation'
    },
    billing: { mode: 'subscription', noteZh: 'MiniMax 支持按量与视频套餐订阅。' },
    meta: { region: 'global', nameEn: 'MiniMax Hailuo', description: 'MiniMax Hailuo video API metadata.', descriptionZh: 'MiniMax Hailuo 视频 API。' }
  },
  kling: {
    links: {
      home: 'https://kling.ai/',
      docs: 'https://kling.ai/document-api/quickStart/productIntroduction/overview',
      pricing: 'https://kling.ai/dev/pricing',
      purchase: 'https://kling.ai/dev/pricing',
      console: 'https://kling.ai/dev',
      apiKey: 'https://kling.ai/dev'
    },
    billing: { mode: 'credits', noteZh: 'Kling 视频生成按积分/单元计费。' },
    meta: { region: 'global', nameEn: 'Kling AI', description: 'Kling video generation API metadata.', descriptionZh: 'Kling 视频生成 API。' }
  },
  pixverse: {
    links: {
      home: 'https://platform.pixverse.ai/',
      docs: 'https://docs.platform.pixverse.ai/quick-start-796052m0',
      pricing: 'https://docs.platform.pixverse.ai/pricing-796039m0',
      purchase: 'https://platform.pixverse.ai/billing',
      console: 'https://platform.pixverse.ai',
      apiKey: 'https://platform.pixverse.ai/'
    },
    billing: { mode: 'subscription', noteZh: 'PixVerse API 会员与积分独立于网页版。' },
    meta: { region: 'global', nameEn: 'PixVerse', description: 'PixVerse text/image-to-video API metadata.', descriptionZh: 'PixVerse 文/图生视频 API。' }
  },
  vidu: {
    links: {
      home: 'https://platform.vidu.cn/',
      docs: 'https://platform.vidu.cn/',
      pricing: 'https://platform.vidu.cn/',
      purchase: 'https://platform.vidu.cn/',
      console: 'https://platform.vidu.cn/',
      apiKey: 'https://platform.vidu.cn/'
    },
    billing: { mode: 'subscription', noteZh: 'Vidu 当前为订阅/配置入口，待验证稳定 API 后提供完整处理。' },
    meta: { region: 'china', nameEn: 'Vidu', description: 'Vidu subscription/API entry.', descriptionZh: 'Vidu 订阅/配置入口。' }
  },
  fal: {
    links: {
      home: 'https://fal.ai/',
      docs: 'https://fal.ai/docs',
      pricing: 'https://fal.ai/pricing',
      purchase: 'https://fal.ai/dashboard/billing',
      console: 'https://fal.ai/dashboard',
      apiKey: 'https://fal.ai/dashboard/keys'
    },
    billing: { mode: 'credits', noteZh: 'fal 聚合平台，图像/视频费用取决于所选模型。' },
    meta: { region: 'global', nameEn: 'fal', description: 'Aggregator for many image/video model APIs.', descriptionZh: '多模型图像/视频聚合平台。' },
    relayCompatible: true
  },
  replicate: {
    links: {
      home: 'https://replicate.com/',
      docs: 'https://replicate.com/docs',
      pricing: 'https://replicate.com/pricing',
      purchase: 'https://replicate.com/account/billing',
      console: 'https://replicate.com/account',
      apiKey: 'https://replicate.com/account/api-tokens'
    },
    billing: { mode: 'paygo', noteZh: 'Replicate 模型聚合平台，按量计费。' },
    meta: { region: 'global', nameEn: 'Replicate', description: 'Model aggregator with image/video prediction APIs.', descriptionZh: '模型聚合平台，支持图像/视频预测 API。' },
    relayCompatible: true
  }
}

/* ------------------------------------------------------------------ */
/*  TRACK_PROVIDER_METADATA  (per-track capability / constraint)      */
/* ------------------------------------------------------------------ */

/** @type {Partial<Record<Track, Record<string, UnknownRecord>>>} */
const TRACK_PROVIDER_METADATA = {
  image: {
    openai: {
      capabilities: { image: { textToImage: true, imageEdit: true, modelList: true } },
      constraints: { negativePrompt: false }
    },
    google: {
      capabilities: { image: { textToImage: true, imageEdit: true } },
      constraints: { negativePrompt: false }
    },
    volcengine: {
      links: { docs: 'https://docs.byteplus.com/en/docs/ModelArk/1541523' },
      capabilities: { image: { textToImage: true, imageEdit: true, modelList: true } }
    },
    siliconflow: {
      capabilities: { image: { textToImage: true, modelList: true } }
    },
    'alibaba-wan': {
      capabilities: { image: { textToImage: true } }
    },
    'baidu-qianfan': {
      capabilities: { image: { textToImage: true } }
    },
    'tencent-tokenhub': {
      capabilities: { image: { textToImage: true, async: true } }
    },
    stability: {
      capabilities: { image: { textToImage: true, imageEdit: true } }
    },
    ideogram: {
      capabilities: { image: { textToImage: true, imageEdit: true } }
    },
    runway: {
      capabilities: { image: { textToImage: true, imageEdit: true } }
    },
    luma: {
      capabilities: { image: { textToImage: true, imageEdit: true, async: true } }
    },
    fal: {
      capabilities: { image: { textToImage: true, imageEdit: true, async: true } }
    },
    replicate: {
      capabilities: { image: { textToImage: true, imageEdit: true, async: true } }
    }
  },
  video: {
    volcengine: {
      links: { docs: 'https://docs.byteplus.com/en/docs/ModelArk/1520757' },
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true, modelList: true } },
      constraints: { durations: ['5s', '10s'] }
    },
    'alibaba-wan': {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    'baidu-qianfan': {
      capabilities: { video: { textToVideo: true, async: true } }
    },
    'tencent-tokenhub': {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    vidu: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    runway: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    luma: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    alibaba: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    minimax: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } },
      constraints: { durations: ['6s', '10s'] }
    },
    kling: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    pixverse: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    fal: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    },
    replicate: {
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  providerInfo()                                                    */
/* ------------------------------------------------------------------ */

/**
 * Merge fallback metadata with provider-own and per-track overrides.
 *
 * Resolution order (later wins):
 *   FALLBACK_PROVIDER_METADATA  ->  TRACK_PROVIDER_METADATA  ->
 *   provider.meta / provider.links / provider.billing  ->
 *   provider root fields
 *
 * @param {unknown} provider - live provider object from the registry
 * @param {Track} [track]  - 'chat' | 'image' | 'video'
 * @returns {ProviderInfoResult} merged info object
 */
export function providerInfo(provider = {}, track) {
  const input = recordOf(provider)
  const providerId = text(input.id)
  const providerMeta = recordOf(input.meta)
  const providerCapabilities = recordOf(input.capabilities)
  const providerCustomizable = recordOf(input.customizable)
  const providerConstraints = recordOf(input.constraints)
  const base = recordOf(FALLBACK_PROVIDER_METADATA[providerId])
  const trackMeta = track ? recordOf(TRACK_PROVIDER_METADATA[track]?.[providerId]) : {}
  const trackMetaMeta = recordOf(trackMeta.meta)

  const capabilities = firstRecord(
    track ? providerCapabilities[track] : null,
    track ? recordOf(providerMeta.capabilities)[track] : null,
    track ? recordOf(trackMeta.capabilities)[track] : null,
    providerCapabilities
  )

  const customizable = firstRecord(
    track ? providerCustomizable[track] : null,
    track ? recordOf(providerMeta.customizable)[track] : null,
    track ? recordOf(trackMeta.customizable)[track] : null,
    providerCustomizable
  )

  const billing = { ...firstRecord(input.billing, providerMeta.billing, trackMeta.billing, base.billing) }
  if (Object.keys(billing).length === 0) billing.mode = 'unknown'

  return {
    links: {
      ...(base.links || {}),
      ...(trackMeta.links || {}),
      ...recordOf(providerMeta.links),
      ...recordOf(input.links)
    },
    billing,
    region: text(providerMeta.region) || text(trackMetaMeta.region) || text(recordOf(base.meta).region) || 'unknown',
    capabilities,
    constraints: firstRecord(
      track ? providerConstraints[track] : null,
      track ? recordOf(providerMeta.constraints)[track] : null,
      trackMeta.constraints
    ),
    customizable,
    description: text(providerMeta.description) || text(recordOf(base.meta).description),
    descriptionZh: text(providerMeta.descriptionZh) || text(recordOf(base.meta).descriptionZh),
    descriptionEn:
      text(providerMeta.descriptionEn) ||
      text(providerMeta.description) ||
      text(recordOf(base.meta).descriptionEn) ||
      text(recordOf(base.meta).description) ||
      '',
    nameZh: text(providerMeta.nameZh) || text(recordOf(base.meta).nameZh),
    nameEn: text(providerMeta.nameEn) || text(recordOf(base.meta).nameEn),
    relay: Boolean(
      input.relayCompatible ||
      base.relayCompatible ||
      capabilities.relay ||
      customizable.relayCompatible
    )
  }
}
