/**
 * Provider registry for chat/image/video tracks.
 *
 * Keep this file data-oriented: the renderer may receive these definitions in
 * redacted form, while the main process still owns the real API keys.
 */

const { attachProviderMeta, uniqueModelIds } = require('./registry-utils')

const IMAGE_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16']
const WIDE_IMAGE_RATIOS = [...IMAGE_RATIOS, '3:2', '2:3']
const VIDEO_RATIOS = ['16:9', '9:16', '1:1']
const COMMON_VIDEO_DURATIONS = [5, 10]
const MODEL_CATALOGS = {
  chat: {
    openai: ['gpt-5.1', 'gpt-5.1-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-1'],
    google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    alibaba: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    moonshot: ['kimi-k2-0711-preview', 'kimi-latest'],
    volcengine: ['doubao-pro-32k', 'doubao-seed-1-6'],
    openrouter: ['openai/gpt-5.1', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'],
    groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
    together: ['meta-llama/Llama-4-17B-128E-Instruct-FP8', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    xai: ['grok-3', 'grok-3-mini'],
    perplexity: ['sonar-pro', 'sonar'],
    siliconflow: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3']
  },
  image: {
    openai: ['gpt-image-2', 'gpt-image-1'],
    google: ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'],
    volcengine: ['doubao-seedream-4-0-250828', 'doubao-seedream-3-0-t2i-250415'],
    'alibaba-wan': ['wan2.6-t2i', 'wan2.2-t2i-plus', 'wan2.2-t2i-flash'],
    'baidu-qianfan': ['qwen-image', 'ernie-vilg-v1'],
    'tencent-tokenhub': ['hunyuan-image'],
    vidu: ['vidu-q1'],
    stability: ['stable-image-core', 'stable-image-ultra'],
    ideogram: ['ideogram-v4', 'ideogram-v3'],
    runway: ['gen4-image'],
    fal: ['fal-ai/flux-pro', 'fal-ai/flux/dev', 'fal-ai/imagen4/preview'],
    replicate: ['black-forest-labs/flux-schnell', 'black-forest-labs/flux-dev'],
    siliconflow: ['black-forest-labs/FLUX.1-dev', 'black-forest-labs/FLUX.1-schnell'],
    'custom-image': ['gpt-image-2', 'gpt-image-1'],
    'custom-image-gemini': ['gemini-2.5-flash-image'],
    'custom-image-ark': ['doubao-seedream-4-0-250828']
  },
  video: {
    volcengine: ['doubao-seedance-2-0-pro-250528', 'doubao-seedance-1-0-pro-250528'],
    'alibaba-wan': ['wan2.7-t2v', 'wan2.6-t2v', 'wan2.5-i2v'],
    runway: ['gen4_turbo', 'gen3a_turbo'],
    kling: ['kling-v2.6', 'kling-v2.5-turbo', 'kling-v2.1'],
    luma: ['ray-2', 'ray-flash-2'],
    minimax: ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02'],
    pixverse: ['pixverse-v6', 'pixverse-v5'],
    fal: ['fal-ai/wan/v2.5/t2v', 'fal-ai/minimax/video-01'],
    replicate: ['wan-video/wan-2.2-t2v-fast', 'minimax/video-01'],
    'baidu-qianfan': ['qianfan-video-latest'],
    'tencent-tokenhub': ['hy-video-1.5'],
    happyhorse: ['happyhorse-1.0/video']
  }
}

const OPENAI_COMPATIBLE = {
  auth: ['bearer'],
  baseUrl: true,
  model: true,
  timeout: true,
  relayCompatible: true
}

function imageConstraints(overrides = {}) {
  return {
    prompt: { maxLength: 4000 },
    negativePrompt: { supported: true, strategy: 'native', maxLength: 1000 },
    ratios: IMAGE_RATIOS,
    resolutions: ['1024', '1536', '2048'],
    sourceImage: { required: false },
    async: false,
    ...overrides
  }
}

function videoConstraints(overrides = {}) {
  return {
    prompt: { maxLength: 2000 },
    negativePrompt: { supported: true, strategy: 'native', maxLength: 500 },
    ratios: VIDEO_RATIOS,
    resolutions: ['720p', '1080p'],
    duration: { supported: true, allowed: COMMON_VIDEO_DURATIONS, coerce: 'nearest' },
    sourceImage: { required: false, requiredForModes: ['image_to_video'] },
    async: true,
    ...overrides
  }
}

/**
 * @typedef {Object} AuthType
 * @property {'bearer'|'api-key'|'header'|'query'|'session'|'none'} type
 * @property {string} [key]
 * @property {string} [prefix]
 */

/**
 * @typedef {Object} ProviderDef
 * @property {string} id
 * @property {string} name
 * @property {string} platform
 * @property {Object} [chat]
 * @property {Object} [image]
 * @property {Object} [video]
 * @property {AuthType} authType
 * @property {Object} defaults
 * @property {string} defaults.baseUrl
 * @property {Object} [healthCheck]
 * @property {Object} [meta]
 * @property {Object} [links]
 * @property {Object} [billing]
 * @property {Object} [capabilities]
 * @property {Object} [constraints]
 * @property {Object} [customizable]
 */

/** @type {ProviderDef[]} */
const REGISTRY = [
  {
    id: 'openai',
    name: 'OpenAI',
    platform: 'OpenAI',
    chat: { defaultModel: 'gpt-5.1', protocol: 'openai' },
    image: {
      defaultModel: 'gpt-image-2',
      protocol: 'openai_image',
      sizes: IMAGE_RATIOS,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.openai.com' },
    links: {
      home: 'https://openai.com/api/',
      docs: 'https://developers.openai.com/api/docs/guides/images-vision',
      pricing: 'https://openai.com/api/pricing/',
      purchase: 'https://platform.openai.com/settings/organization/billing/overview',
      console: 'https://platform.openai.com/',
      apiKey: 'https://platform.openai.com/api-keys'
    },
    billing: { mode: 'paygo', note: 'API billing is separate from ChatGPT plans; use the official billing page for live prices.' },
    capabilities: {
      chat: { text: true, integrationStatus: 'handler' },
      image: { textToImage: true, imageEdit: true, negativePrompt: 'appendToPrompt', output: ['url', 'base64'], integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 8000 },
        negativePrompt: { supported: true, strategy: 'appendToPrompt', maxLength: 1000 },
        ratios: IMAGE_RATIOS,
        resolutions: ['1024', '1536', '2048', '4096']
      })
    },
    customizable: { image: OPENAI_COMPATIBLE, chat: OPENAI_COMPATIBLE },
    meta: { region: 'global', description: 'OpenAI chat and GPT-Image generation.' }
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    platform: 'Anthropic',
    chat: { defaultModel: 'claude-sonnet-4-6', protocol: 'anthropic', thinking: true },
    authType: { type: 'header', key: 'x-api-key' },
    defaults: { baseUrl: 'https://api.anthropic.com' },
    links: {
      home: 'https://www.anthropic.com/api',
      docs: 'https://docs.anthropic.com/',
      pricing: 'https://www.anthropic.com/pricing#api',
      purchase: 'https://console.anthropic.com/settings/billing',
      console: 'https://console.anthropic.com/',
      apiKey: 'https://console.anthropic.com/settings/keys'
    },
    billing: { mode: 'paygo', note: 'Chat API provider; media generation is not configured here.' },
    capabilities: { chat: { text: true, thinking: true, integrationStatus: 'handler' } },
    customizable: { chat: { auth: ['header'], baseUrl: true, model: true, timeout: true } },
    healthCheck: {
      url: '/v1/messages',
      method: 'POST',
      body: { max_tokens: 1, model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'ping' }] }
    },
    meta: { region: 'global', description: 'Claude chat and reasoning models.' }
  },
  {
    id: 'google',
    name: 'Google Gemini',
    platform: 'Google',
    chat: { defaultModel: 'gemini-2.5-pro', protocol: 'gemini' },
    image: {
      defaultModel: 'gemini-2.5-flash-image',
      protocol: 'gemini_image',
      sizes: IMAGE_RATIOS,
      integrationStatus: 'handler'
    },
    video: {
      defaultModel: 'veo-3.1',
      protocol: 'gemini_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'query', key: 'key' },
    defaults: { baseUrl: 'https://generativelanguage.googleapis.com' },
    links: {
      home: 'https://ai.google.dev/gemini-api',
      docs: 'https://ai.google.dev/gemini-api/docs',
      pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
      purchase: 'https://aistudio.google.com/usage',
      console: 'https://aistudio.google.com/',
      apiKey: 'https://aistudio.google.com/apikey'
    },
    billing: { mode: 'paygo', note: 'Gemini API usage is billed in Google AI Studio / Google Cloud; check pricing before video calls.' },
    capabilities: {
      chat: { text: true, multimodal: true, integrationStatus: 'handler' },
      image: { textToImage: true, imageEdit: true, nativeImage: 'Nano Banana', integrationStatus: 'handler' },
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Veo', integrationStatus: 'metadata' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 32000 },
        negativePrompt: { supported: true, strategy: 'appendToPrompt', maxLength: 2000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '2048']
      }),
      video: videoConstraints({
        prompt: { maxLength: 4000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, allowed: [4, 6, 8], coerce: 'nearest' }
      })
    },
    customizable: {
      image: { auth: ['query'], baseUrl: true, model: true, timeout: true, relayCompatible: true, presets: ['gemini-compatible'] },
      video: { auth: ['query'], baseUrl: true, model: true, timeout: true, relayCompatible: true }
    },
    meta: { region: 'global', description: 'Gemini chat, Nano Banana image generation, and Veo video metadata.' }
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    platform: 'DeepSeek',
    chat: { defaultModel: 'deepseek-chat', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.deepseek.com' },
    links: {
      home: 'https://www.deepseek.com/',
      docs: 'https://api-docs.deepseek.com/',
      pricing: 'https://api-docs.deepseek.com/quick_start/pricing',
      purchase: 'https://platform.deepseek.com/usage',
      console: 'https://platform.deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible chat provider.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'both', description: 'DeepSeek OpenAI-compatible chat models.' }
  },
  {
    id: 'groq',
    name: 'Groq',
    platform: 'Groq',
    chat: { defaultModel: 'llama-3.3-70b-versatile', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.groq.com/openai' },
    links: {
      home: 'https://groq.com/',
      docs: 'https://console.groq.com/docs/overview',
      pricing: 'https://groq.com/pricing/',
      purchase: 'https://console.groq.com/settings/billing',
      console: 'https://console.groq.com/',
      apiKey: 'https://console.groq.com/keys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible chat provider.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'global', description: 'Fast OpenAI-compatible inference.' }
  },
  {
    id: 'together',
    name: 'Together AI',
    platform: 'Together',
    chat: { defaultModel: 'meta-llama/Llama-4-17B-128E-Instruct-FP8', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.together.xyz' },
    links: {
      home: 'https://www.together.ai/',
      docs: 'https://docs.together.ai/',
      pricing: 'https://www.together.ai/pricing',
      purchase: 'https://api.together.ai/settings/billing',
      console: 'https://api.together.ai/',
      apiKey: 'https://api.together.ai/settings/api-keys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible model platform.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'global', description: 'Open model aggregation platform.' }
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    platform: 'OpenRouter',
    chat: { defaultModel: 'openai/gpt-5.1', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://openrouter.ai/api' },
    links: {
      home: 'https://openrouter.ai/',
      docs: 'https://openrouter.ai/docs',
      pricing: 'https://openrouter.ai/models',
      purchase: 'https://openrouter.ai/credits',
      console: 'https://openrouter.ai/settings',
      apiKey: 'https://openrouter.ai/settings/keys'
    },
    billing: { mode: 'credits', note: 'OpenAI-compatible model router with prepaid credits.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'global', description: 'Multi-model OpenAI-compatible router.' }
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    platform: 'xAI',
    chat: { defaultModel: 'grok-3', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.x.ai' },
    links: {
      home: 'https://x.ai/api',
      docs: 'https://docs.x.ai/docs/overview',
      pricing: 'https://docs.x.ai/docs/models',
      purchase: 'https://console.x.ai/team/default/billing',
      console: 'https://console.x.ai/',
      apiKey: 'https://console.x.ai/team/default/api-keys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible chat provider.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'global', description: 'Grok OpenAI-compatible chat models.' }
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    platform: 'Perplexity',
    chat: { defaultModel: 'sonar-pro', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.perplexity.ai' },
    links: {
      home: 'https://www.perplexity.ai/',
      docs: 'https://docs.perplexity.ai/',
      pricing: 'https://docs.perplexity.ai/getting-started/pricing',
      purchase: 'https://www.perplexity.ai/settings/api',
      console: 'https://www.perplexity.ai/settings/api',
      apiKey: 'https://www.perplexity.ai/settings/api'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible search/chat provider.' },
    capabilities: { chat: { text: true, search: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'global', description: 'AI search and chat API.' }
  },
  {
    id: 'volcengine',
    name: '即梦 / 火山方舟',
    platform: 'Volcengine',
    chat: { defaultModel: 'doubao-pro-32k', protocol: 'openai' },
    image: {
      defaultModel: 'doubao-seedream-4-0-250828',
      protocol: 'ark_image',
      sizes: IMAGE_RATIOS,
      integrationStatus: 'handler'
    },
    video: {
      defaultModel: 'doubao-seedance-2-0-pro-250528',
      protocol: 'ark_video_task',
      polling: true,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
    links: {
      home: 'https://www.volcengine.com/product/ark',
      docs: 'https://www.volcengine.com/docs/82379/1520757?lang=zh',
      pricing: 'https://www.volcengine.com/docs/82379/1544106?lang=zh',
      purchase: 'https://console.volcengine.com/ark',
      console: 'https://console.volcengine.com/ark',
      apiKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
      jimeng: 'https://www.volcengine.com/product/jimeng'
    },
    billing: {
      mode: 'credits',
      note: 'ModelArk media models use official API billing.',
      noteZh: '火山方舟 API 按官方接口计费。'
    },
    capabilities: {
      chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' },
      image: { textToImage: true, imageEdit: true, modelFamily: 'Seedream', integrationStatus: 'handler' },
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Seedance', integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 2000 },
        ratios: IMAGE_RATIOS,
        resolutions: ['1024', '2048', '4096']
      }),
      video: videoConstraints({
        prompt: { maxLength: 2000 },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, allowed: [5, 10], coerce: 'nearest' }
      })
    },
    customizable: {
      chat: OPENAI_COMPATIBLE,
      image: { ...OPENAI_COMPATIBLE, presets: ['ark-compatible'] },
      video: { ...OPENAI_COMPATIBLE, presets: ['ark-compatible-task'], polling: true }
    },
    meta: {
      region: 'china',
      nameZh: '火山方舟',
      nameEn: 'Volcengine ModelArk',
      description: 'Doubao chat, Seedream image, and Seedance video through Volcengine ModelArk.',
      descriptionZh: '火山方舟 API，支持豆包对话、Seedream 生图和 Seedance 视频。'
    }
  },
  {
    id: 'volcengine-coding-plan',
    name: 'Volcengine Coding Plan',
    platform: 'Volcengine',
    chat: {
      defaultModel: '',
      protocol: 'volcengine_coding_plan',
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
    links: {
      home: 'https://www.volcengine.com/product/ark',
      docs: 'https://www.volcengine.com/docs/82379/1928261?lang=zh',
      pricing: 'https://www.volcengine.com/docs/82379/1928261?lang=zh',
      purchase: 'https://console.volcengine.com/ark',
      console: 'https://console.volcengine.com/ark',
      apiKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
      codingPlan: 'https://www.volcengine.com/docs/82379/1928261?lang=zh'
    },
    billing: {
      mode: 'subscription',
      note: 'Reference entry for Volcengine Coding Plan subscriptions.',
      noteZh: '火山方舟编程套餐订阅资料入口。'
    },
    capabilities: {
      chat: { text: true, codingPlan: true, integrationStatus: 'metadata' }
    },
    customizable: { chat: { auth: ['bearer'], baseUrl: true, model: true, timeout: true } },
    meta: {
      region: 'china',
      nameZh: '火山方舟编程套餐',
      nameEn: 'Volcengine Coding Plan',
      description: 'Volcengine Coding Plan setup links; this entry is informational and is not selectable as a chat handler.',
      descriptionZh: '火山方舟编程套餐订阅资料入口，不作为本应用直连对话接口。'
    }
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    platform: 'OpenCode',
    chat: {
      defaultModel: '',
      protocol: 'opencode_go',
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: '' },
    links: {
      home: 'https://opencode.ai/',
      docs: 'https://opencode.ai/docs/go/',
      pricing: 'https://opencode.ai/docs/go/',
      purchase: 'https://opencode.ai/docs/go/',
      console: 'https://opencode.ai/',
      apiKey: 'https://opencode.ai/docs/go/'
    },
    billing: {
      mode: 'subscription',
      note: 'OpenCode Go is a subscription entry. This build lists setup links only until a stable compatible chat handler is added.',
      noteZh: 'OpenCode Go 订阅资料入口；当前版本仅提供链接，不作为直连对话接口。'
    },
    capabilities: {
      chat: { text: true, webSubscription: true, integrationStatus: 'metadata' }
    },
    customizable: { chat: { auth: ['bearer'], baseUrl: true, model: true, timeout: true } },
    meta: {
      region: 'global',
      nameZh: 'OpenCode Go',
      nameEn: 'OpenCode Go',
      description: 'OpenCode Go subscription setup links. Not selectable as a direct chat handler in this build.',
      descriptionZh: 'OpenCode Go 订阅资料入口，不作为本应用直连对话接口。'
    }
  },
  {
    id: 'chatgpt-plans',
    name: 'ChatGPT Plus / Pro',
    platform: 'OpenAI',
    chat: {
      defaultModel: '',
      protocol: 'chatgpt_web_plan',
      integrationStatus: 'metadata'
    },
    authType: { type: 'none' },
    defaults: { baseUrl: '' },
    links: {
      home: 'https://chatgpt.com/',
      docs: 'https://help.openai.com/',
      pricing: 'https://chatgpt.com/pricing/',
      purchase: 'https://chatgpt.com/pricing/',
      console: 'https://chatgpt.com/'
    },
    billing: { mode: 'subscription', note: 'ChatGPT Plus/Pro are web subscriptions, not OpenAI API keys. Gravuresse does not log in to web accounts or reuse browser cookies.' },
    capabilities: {
      chat: { text: true, webSubscription: true, integrationStatus: 'metadata' }
    },
    customizable: { chat: {} },
    meta: { region: 'global', description: 'ChatGPT web subscription reference. Use OpenAI API for direct in-app calls.' }
  },
  {
    id: 'claude-plans',
    name: 'Claude Pro / Max',
    platform: 'Anthropic',
    chat: {
      defaultModel: '',
      protocol: 'claude_web_plan',
      integrationStatus: 'metadata'
    },
    authType: { type: 'none' },
    defaults: { baseUrl: '' },
    links: {
      home: 'https://claude.ai/',
      docs: 'https://support.claude.com/',
      pricing: 'https://www.anthropic.com/pricing',
      purchase: 'https://claude.ai/upgrade',
      console: 'https://claude.ai/'
    },
    billing: { mode: 'subscription', note: 'Claude Pro/Max are web subscriptions. Use Anthropic API keys for direct provider calls.' },
    capabilities: {
      chat: { text: true, webSubscription: true, integrationStatus: 'metadata' }
    },
    customizable: { chat: {} },
    meta: { region: 'global', description: 'Claude web subscription reference. Not selectable as a direct API provider.' }
  },
  {
    id: 'alibaba',
    name: 'Alibaba Qwen',
    platform: 'Alibaba',
    chat: { defaultModel: 'qwen-plus', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode' },
    links: {
      home: 'https://www.alibabacloud.com/product/modelstudio',
      docs: 'https://www.alibabacloud.com/help/en/model-studio/',
      pricing: 'https://www.alibabacloud.com/help/en/model-studio/models',
      purchase: 'https://bailian.console.aliyun.com/',
      console: 'https://bailian.console.aliyun.com/',
      apiKey: 'https://bailian.console.aliyun.com/'
    },
    billing: { mode: 'paygo', note: 'Qwen OpenAI-compatible chat endpoint; Wan media uses the Alibaba Wan provider entry.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'china', description: 'Qwen OpenAI-compatible chat models.' }
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    platform: 'Moonshot',
    chat: { defaultModel: 'kimi-k2-0711-preview', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.moonshot.cn' },
    links: {
      home: 'https://www.moonshot.cn/',
      docs: 'https://platform.moonshot.cn/docs',
      pricing: 'https://platform.moonshot.cn/docs/pricing',
      purchase: 'https://platform.moonshot.cn/console/account',
      console: 'https://platform.moonshot.cn/console',
      apiKey: 'https://platform.moonshot.cn/console/api-keys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible chat provider.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'china', description: 'Kimi chat models.' }
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI',
    platform: 'Zhipu',
    chat: { defaultModel: 'glm-4-plus', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    links: {
      home: 'https://open.bigmodel.cn/',
      docs: 'https://docs.bigmodel.cn/',
      pricing: 'https://open.bigmodel.cn/pricing',
      purchase: 'https://open.bigmodel.cn/usercenter/account',
      console: 'https://open.bigmodel.cn/usercenter',
      apiKey: 'https://open.bigmodel.cn/usercenter/apikeys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible chat provider.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'china', description: 'GLM chat models.' }
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    platform: 'SiliconFlow',
    chat: { defaultModel: 'Qwen/Qwen2.5-72B-Instruct', protocol: 'openai' },
    image: {
      defaultModel: 'black-forest-labs/FLUX.1-dev',
      protocol: 'openai_image',
      sizes: IMAGE_RATIOS,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.siliconflow.cn' },
    links: {
      home: 'https://siliconflow.cn/',
      docs: 'https://docs.siliconflow.cn/',
      pricing: 'https://siliconflow.cn/pricing',
      purchase: 'https://cloud.siliconflow.cn/account/billing',
      console: 'https://cloud.siliconflow.cn/',
      apiKey: 'https://cloud.siliconflow.cn/account/ak'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible model platform with image models.' },
    capabilities: {
      chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' },
      image: { textToImage: true, openaiCompatible: true, modelFamily: 'FLUX', integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 4000 },
        negativePrompt: { supported: true, strategy: 'appendToPrompt', maxLength: 1000 },
        ratios: IMAGE_RATIOS
      })
    },
    customizable: { chat: OPENAI_COMPATIBLE, image: { ...OPENAI_COMPATIBLE, presets: ['openai-images-compatible'] } },
    meta: { region: 'china', description: 'Open model inference and image generation.' }
  },
  {
    id: 'lingyi',
    name: '01.AI',
    platform: '01.AI',
    chat: { defaultModel: 'yi-lightning', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.lingyiwanwu.com' },
    links: {
      home: 'https://www.lingyiwanwu.com/',
      docs: 'https://platform.lingyiwanwu.com/docs',
      pricing: 'https://platform.lingyiwanwu.com/pricing',
      purchase: 'https://platform.lingyiwanwu.com/account',
      console: 'https://platform.lingyiwanwu.com/',
      apiKey: 'https://platform.lingyiwanwu.com/apikeys'
    },
    billing: { mode: 'paygo', note: 'OpenAI-compatible chat provider.' },
    capabilities: { chat: { text: true, openaiCompatible: true, integrationStatus: 'handler' } },
    customizable: { chat: OPENAI_COMPATIBLE },
    meta: { region: 'china', description: 'Yi chat models.' }
  },
  {
    id: 'alibaba-wan',
    name: '阿里万相 / Wan',
    platform: 'Alibaba',
    image: {
      defaultModel: 'wan2.6-t2i',
      protocol: 'wan_image_task',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'handler'
    },
    video: {
      defaultModel: 'wan2.7-t2v',
      protocol: 'wan_video_task',
      polling: true,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://dashscope.aliyuncs.com/api/v1' },
    links: {
      home: 'https://www.alibabacloud.com/product/modelstudio',
      docs: 'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference',
      pricing: 'https://www.alibabacloud.com/help/en/model-studio/models',
      purchase: 'https://bailian.console.aliyun.com/',
      console: 'https://bailian.console.aliyun.com/',
      apiKey: 'https://bailian.console.aliyun.com/'
    },
    billing: { mode: 'paygo', note: 'Wan media APIs are async tasks; prompt, size, and duration constraints vary by model.' },
    capabilities: {
      image: { textToImage: true, async: false, modelFamily: 'Wan', integrationStatus: 'handler' },
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Wan', integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 2100 },
        negativePrompt: { supported: true, strategy: 'native', maxLength: 500 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1280', '1440'],
        async: false
      }),
      video: videoConstraints({
        prompt: { maxLength: 1800 },
        negativePrompt: { supported: true, strategy: 'native', maxLength: 500 },
        ratios: VIDEO_RATIOS,
        resolutions: ['720P', '1080P', '720p', '1080p'],
        duration: { supported: true, min: 2, max: 10, allowed: [2, 3, 4, 5, 6, 7, 8, 9, 10], coerce: 'nearest' }
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true }
    },
    meta: { region: 'china', description: 'Alibaba Bailian Wan image and video generation with direct handlers.' }
  },
  {
    id: 'baidu-qianfan',
    name: '百度千帆',
    platform: 'Baidu',
    image: {
      defaultModel: 'qwen-image',
      protocol: 'baidu_qianfan_image',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'handler'
    },
    video: {
      defaultModel: 'qianfan-video-latest',
      protocol: 'baidu_qianfan_video_task',
      polling: true,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://qianfan.baidubce.com' },
    links: {
      home: 'https://cloud.baidu.com/product/qianfan.html',
      docs: 'https://cloud.baidu.com/doc/qianfan-api/index.html',
      pricing: 'https://cloud.baidu.com/doc/qianfan-price/index.html',
      purchase: 'https://console.bce.baidu.com/qianfan/ais/console/charge',
      console: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
      apiKey: 'https://console.bce.baidu.com/iam/#/iam/apikey/list'
    },
    billing: { mode: 'paygo', note: 'Qianfan media APIs use Baidu API Key billing; check the official console for current package and pay-as-you-go details.' },
    capabilities: {
      image: { textToImage: true, negativePrompt: 'native', modelFamily: 'Qianfan Image', integrationStatus: 'handler' },
      video: { textToVideo: true, imageToVideo: false, async: true, negativePrompt: 'appendToPrompt', modelFamily: 'Qianfan Video', integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 800 },
        negativePrompt: { supported: true, strategy: 'native', maxLength: 500 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '1536', '2048']
      }),
      video: videoConstraints({
        prompt: { maxLength: 1500 },
        negativePrompt: { supported: true, strategy: 'appendToPrompt', maxLength: 500 },
        ratios: ['16:9', '9:16', '1:1', '3:4', '4:3'],
        resolutions: ['540p', '720p', '1080p'],
        duration: { supported: true, min: 1, max: 16 },
        sourceImage: { required: false }
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true }
    },
    meta: { region: 'china', description: 'Baidu Qianfan image generation and text-to-video task APIs.' }
  },
  {
    id: 'tencent-tokenhub',
    name: '腾讯混元 / TokenHub',
    platform: 'Tencent',
    image: {
      defaultModel: 'hunyuan-image',
      protocol: 'tencent_hunyuan_image',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    video: {
      defaultModel: 'hy-video-1.5',
      protocol: 'tencent_tokenhub_video_task',
      polling: true,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://tokenhub.tencentmaas.com/v1/api' },
    links: {
      home: 'https://cloud.tencent.com/product/tokenhub',
      docs: 'https://cloud.tencent.com/document/product/1823/130081',
      pricing: 'https://cloud.tencent.com/document/product/1823',
      purchase: 'https://buy.cloud.tencent.com/',
      console: 'https://console.cloud.tencent.com/',
      apiKey: 'https://console.cloud.tencent.com/cam/capi'
    },
    billing: { mode: 'paygo', note: 'TokenHub uses Tencent Cloud billing. Hunyuan image is listed as official setup metadata; TokenHub video is directly callable here.' },
    capabilities: {
      image: { textToImage: true, async: true, modelFamily: 'Hunyuan Image', integrationStatus: 'metadata' },
      video: { textToVideo: true, imageToVideo: true, async: true, negativePrompt: 'appendToPrompt', openaiCompatible: true, modelFamily: 'Hunyuan Video', integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 2000 },
        negativePrompt: { supported: true, strategy: 'modelDependent', maxLength: 500 },
        ratios: WIDE_IMAGE_RATIOS,
        async: true
      }),
      video: videoConstraints({
        prompt: { maxLength: 2000 },
        negativePrompt: { supported: true, strategy: 'appendToPrompt', maxLength: 500 },
        ratios: VIDEO_RATIOS,
        resolutions: ['720p', '1080p'],
        duration: { supported: true, min: 1, max: 10 },
        sourceImage: { required: false }
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true }
    },
    meta: { region: 'china', description: 'Tencent TokenHub OpenAI-compatible Hunyuan video submit/query API; Hunyuan image remains a setup link entry.' }
  },
  {
    id: 'vidu',
    name: 'Vidu',
    platform: 'Vidu',
    video: {
      defaultModel: 'vidu-q1',
      protocol: 'vidu_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://platform.vidu.cn' },
    links: {
      home: 'https://platform.vidu.cn/',
      docs: 'https://platform.vidu.cn/',
      pricing: 'https://platform.vidu.cn/',
      purchase: 'https://platform.vidu.cn/',
      console: 'https://platform.vidu.cn/',
      apiKey: 'https://platform.vidu.cn/'
    },
    billing: { mode: 'subscription', note: 'Vidu is included as a subscription/API setup entry until its callable template is verified against stable official API fields.' },
    capabilities: {
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Vidu', integrationStatus: 'metadata' }
    },
    constraints: {
      video: videoConstraints({
        prompt: { maxLength: 2000 },
        negativePrompt: { supported: true, strategy: 'modelDependent', maxLength: 1000 },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, min: 1, max: 10 }
      })
    },
    customizable: { video: { auth: ['bearer', 'header', 'session'], baseUrl: true, model: true, timeout: true, polling: true } },
    meta: { region: 'china', description: 'Vidu subscription/API entry. Use Custom Video API if your Vidu-compatible relay provides submit/poll paths.' }
  },
  {
    id: 'stability',
    name: 'Stability AI',
    platform: 'Stability AI',
    image: {
      defaultModel: 'stable-image-core',
      protocol: 'stability_image',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.stability.ai' },
    links: {
      home: 'https://platform.stability.ai/',
      docs: 'https://platform.stability.ai/docs/api-reference',
      pricing: 'https://platform.stability.ai/pricing',
      purchase: 'https://platform.stability.ai/account/credits',
      console: 'https://platform.stability.ai/account/credits',
      apiKey: 'https://platform.stability.ai/account/keys'
    },
    billing: { mode: 'credits', note: 'Credit-based image API; live credit prices are on the official pricing page.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, negativePrompt: 'native', modelFamily: 'Stable Image', integrationStatus: 'metadata' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'native', maxLength: 10000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '1536', '2048']
      })
    },
    customizable: { image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, relayCompatible: true } },
    meta: { region: 'global', description: 'Stable Image generation API metadata.' }
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    platform: 'Ideogram',
    image: {
      defaultModel: 'ideogram-v4',
      protocol: 'ideogram_image',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.ideogram.ai' },
    links: {
      home: 'https://ideogram.ai/api',
      docs: 'https://developer.ideogram.ai/ideogram-api/api-overview',
      pricing: 'https://ideogram.ai/api-pricing/',
      purchase: 'https://ideogram.ai/manage-api',
      console: 'https://ideogram.ai/manage-api',
      apiKey: 'https://ideogram.ai/manage-api'
    },
    billing: { mode: 'paygo', note: 'Image API is priced per generated image/model tier on the official pricing page.' },
    capabilities: {
      image: { textToImage: true, imageEdit: true, styleReference: true, modelFamily: 'Ideogram', integrationStatus: 'metadata' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 4000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '2048']
      })
    },
    customizable: { image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true } },
    meta: { region: 'global', description: 'Ideogram image generation API metadata.' }
  },
  {
    id: 'runway',
    name: 'Runway',
    platform: 'Runway',
    image: {
      defaultModel: 'gen4-image',
      protocol: 'runway_image_task',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    video: {
      defaultModel: 'gen4_turbo',
      protocol: 'runway_task',
      polling: true,
      imageToVideo: true,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.dev.runwayml.com' },
    links: {
      home: 'https://runwayml.com/en/api',
      docs: 'https://docs.dev.runwayml.com/',
      pricing: 'https://docs.dev.runwayml.com/guides/pricing/',
      purchase: 'https://dev.runwayml.com/billing',
      console: 'https://dev.runwayml.com/',
      apiKey: 'https://dev.runwayml.com/api-keys'
    },
    billing: { mode: 'credits', note: 'Runway API uses developer-portal credits; image/video rates vary by model.' },
    capabilities: {
      image: { textToImage: true, async: true, modelFamily: 'Gen', integrationStatus: 'metadata' },
      video: { imageToVideo: true, async: true, polling: true, modelFamily: 'Gen', integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 1000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: WIDE_IMAGE_RATIOS,
        async: true
      }),
      video: videoConstraints({
        prompt: { maxLength: 1000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, allowed: [5, 10], coerce: 'nearest' },
        sourceImage: { required: true, requiredForModes: ['image_to_video'] }
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true }
    },
    meta: { region: 'global', description: 'Runway image metadata and image-to-video handler.' }
  },
  {
    id: 'luma',
    name: 'Luma AI',
    platform: 'Luma',
    image: {
      defaultModel: 'photon-1',
      protocol: 'luma_image_task',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    video: {
      defaultModel: 'ray-2',
      protocol: 'luma_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.lumalabs.ai' },
    links: {
      home: 'https://lumalabs.ai/api',
      docs: 'https://docs.lumalabs.ai/docs/api',
      pricing: 'https://lumalabs.ai/pricing',
      purchase: 'https://lumalabs.ai/pricing',
      console: 'https://lumalabs.ai/api',
      apiKey: 'https://lumalabs.ai/api'
    },
    billing: { mode: 'subscription', note: 'Luma plans include image/video usage; API workflows are async request plus status polling.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, referenceImage: true, async: true, modelFamily: 'Photon', integrationStatus: 'metadata' },
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Ray', integrationStatus: 'metadata' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 5000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: WIDE_IMAGE_RATIOS,
        async: true
      }),
      video: videoConstraints({
        prompt: { maxLength: 5000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, min: 5, max: 20 }
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true }
    },
    meta: { region: 'global', description: 'Luma Dream Machine image and video API metadata.' }
  },
  {
    id: 'minimax',
    name: 'MiniMax Hailuo',
    platform: 'MiniMax',
    video: {
      defaultModel: 'MiniMax-Hailuo-2.3',
      protocol: 'minimax_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.minimax.io' },
    links: {
      home: 'https://www.minimax.io/',
      docs: 'https://platform.minimax.io/docs/api-reference/video-generation-t2v',
      pricing: 'https://platform.minimax.io/docs/pricing/overview',
      purchase: 'https://platform.minimax.io/docs/guides/pricing-video',
      console: 'https://platform.minimax.io/',
      apiKey: 'https://platform.minimax.io/docs/guides/quickstart-preparation'
    },
    billing: { mode: 'subscription', note: 'Supports pay-as-you-go plus video packages/subscription plans; use official pages for current rates.' },
    capabilities: {
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Hailuo', integrationStatus: 'metadata' }
    },
    constraints: {
      video: videoConstraints({
        prompt: { maxLength: 2000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: VIDEO_RATIOS,
        resolutions: ['768p', '1080p'],
        duration: { supported: true, allowed: [6, 10], coerce: 'nearest' }
      })
    },
    customizable: { video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true } },
    meta: { region: 'global', description: 'MiniMax Hailuo video API metadata.' }
  },
  {
    id: 'kling',
    name: 'Kling AI',
    platform: 'Kling',
    video: {
      defaultModel: 'kling-v2.6',
      protocol: 'kling_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api-singapore.klingai.com' },
    links: {
      home: 'https://kling.ai/',
      docs: 'https://kling.ai/document-api/quickStart/productIntroduction/overview',
      pricing: 'https://kling.ai/dev/pricing',
      purchase: 'https://kling.ai/dev/pricing',
      console: 'https://kling.ai/dev',
      apiKey: 'https://kling.ai/dev'
    },
    billing: { mode: 'credits', note: 'Kling Open Platform video pricing is credit/unit based; verify regional availability in the console.' },
    capabilities: {
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'Kling', integrationStatus: 'metadata' }
    },
    constraints: {
      video: videoConstraints({
        prompt: { maxLength: 2500 },
        negativePrompt: { supported: true, strategy: 'native', maxLength: 2500 },
        ratios: VIDEO_RATIOS,
        resolutions: ['720p', '1080p'],
        duration: { supported: true, allowed: [5, 10], coerce: 'nearest' }
      })
    },
    customizable: { video: { auth: ['bearer', 'header'], baseUrl: true, model: true, timeout: true, polling: true } },
    meta: { region: 'global', description: 'Kling video generation API metadata.' }
  },
  {
    id: 'pixverse',
    name: 'PixVerse',
    platform: 'PixVerse',
    video: {
      defaultModel: 'pixverse-v6',
      protocol: 'pixverse_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'header', key: 'API-KEY' },
    defaults: { baseUrl: 'https://platform.pixverse.ai' },
    links: {
      home: 'https://platform.pixverse.ai/',
      docs: 'https://docs.platform.pixverse.ai/quick-start-796052m0',
      pricing: 'https://docs.platform.pixverse.ai/pricing-796039m0',
      purchase: 'https://platform.pixverse.ai/billing',
      console: 'https://platform.pixverse.ai/',
      apiKey: 'https://platform.pixverse.ai/'
    },
    billing: { mode: 'subscription', note: 'API memberships and credits are separate from PixVerse Web memberships.' },
    capabilities: {
      video: { textToVideo: true, imageToVideo: true, async: true, modelFamily: 'PixVerse', integrationStatus: 'metadata' }
    },
    constraints: {
      video: videoConstraints({
        prompt: { maxLength: 2048 },
        negativePrompt: { supported: true, strategy: 'native', maxLength: 1024 },
        ratios: VIDEO_RATIOS,
        resolutions: ['360p', '540p', '720p', '1080p'],
        duration: { supported: true, allowed: [5, 8, 10], coerce: 'nearest' }
      })
    },
    customizable: { video: { auth: ['header'], baseUrl: true, model: true, timeout: true, polling: true, requiredHeaders: ['API-KEY', 'AI-trace-id'] } },
    meta: { region: 'global', description: 'PixVerse text/image-to-video API metadata.' }
  },
  {
    id: 'fal',
    name: 'fal',
    platform: 'fal',
    image: {
      defaultModel: 'fal-ai/flux-pro',
      protocol: 'fal_image_task',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    video: {
      defaultModel: 'fal-ai/wan/v2.5/t2v',
      protocol: 'fal_video_task',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://fal.run' },
    links: {
      home: 'https://fal.ai/',
      docs: 'https://fal.ai/docs',
      pricing: 'https://fal.ai/pricing',
      purchase: 'https://fal.ai/dashboard/billing',
      console: 'https://fal.ai/dashboard',
      apiKey: 'https://fal.ai/dashboard/keys'
    },
    billing: { mode: 'paygo', note: 'Aggregator/relay platform; image and video units depend on the selected model.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, relay: true, modelCatalog: true, integrationStatus: 'metadata' },
      video: { textToVideo: true, imageToVideo: true, async: true, relay: true, modelCatalog: true, integrationStatus: 'metadata' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'modelDependent', maxLength: 2000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '2048', '4096'],
        modelDependent: true
      }),
      video: videoConstraints({
        prompt: { maxLength: 5000 },
        negativePrompt: { supported: true, strategy: 'modelDependent', maxLength: 2000 },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, min: 1, max: 20 },
        modelDependent: true
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, relayCompatible: true, pathPrefix: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true, relayCompatible: true, pathPrefix: true }
    },
    meta: { region: 'global', description: 'Aggregator for many image/video model APIs.' }
  },
  {
    id: 'replicate',
    name: 'Replicate',
    platform: 'Replicate',
    image: {
      defaultModel: 'black-forest-labs/flux-schnell',
      protocol: 'replicate_prediction',
      sizes: WIDE_IMAGE_RATIOS,
      integrationStatus: 'metadata'
    },
    video: {
      defaultModel: 'wan-video/wan-2.2-t2v-fast',
      protocol: 'replicate_prediction',
      polling: true,
      integrationStatus: 'metadata'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.replicate.com' },
    links: {
      home: 'https://replicate.com/',
      docs: 'https://replicate.com/docs',
      pricing: 'https://replicate.com/pricing',
      purchase: 'https://replicate.com/account/billing',
      console: 'https://replicate.com/account',
      apiKey: 'https://replicate.com/account/api-tokens'
    },
    billing: { mode: 'paygo', note: 'Aggregator/relay platform; official models can have stable APIs and predictable pricing.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, relay: true, modelCatalog: true, integrationStatus: 'metadata' },
      video: { textToVideo: true, imageToVideo: true, async: true, relay: true, modelCatalog: true, integrationStatus: 'metadata' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'modelDependent', maxLength: 2000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '2048', '4096'],
        modelDependent: true
      }),
      video: videoConstraints({
        prompt: { maxLength: 5000 },
        negativePrompt: { supported: true, strategy: 'modelDependent', maxLength: 2000 },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, min: 1, max: 20 },
        modelDependent: true
      })
    },
    customizable: {
      image: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, relayCompatible: true, pathPrefix: true },
      video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true, relayCompatible: true, pathPrefix: true }
    },
    meta: { region: 'global', description: 'Model aggregator with image/video prediction APIs.' }
  },
  {
    id: 'custom-image',
    name: 'Relay / GPT Image 2',
    platform: 'Custom',
    image: {
      defaultModel: 'gpt-image-2',
      protocol: 'custom_image_openai',
      format: 'custom',
      sizes: WIDE_IMAGE_RATIOS,
      presets: ['openai-images-compatible', 'gemini-compatible', 'ark-compatible', 'qianfan-compatible', 'hunyuan-compatible'],
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: '' },
    links: {
      docs: 'https://platform.openai.com/docs/api-reference/images',
      pricing: 'https://openai.com/api/pricing/'
    },
    billing: { mode: 'unknown', note: 'Custom relay billing depends on the relay provider; configure only trusted HTTPS endpoints.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, relay: true, customBaseUrl: true, integrationStatus: 'custom-template' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'templateDependent', maxLength: 2000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '1536', '2048', '4096'],
        modelDependent: true
      })
    },
    customizable: {
      image: {
        auth: ['bearer', 'api-key', 'header', 'query', 'session'],
        baseUrl: true,
        headerName: true,
        model: true,
        pathPrefix: true,
        timeout: true,
        presets: ['openai-images-compatible', 'gemini-compatible', 'ark-compatible', 'qianfan-compatible', 'hunyuan-compatible'],
        relayCompatible: true
      }
    },
    meta: {
      region: 'both',
      nameZh: '中转站 / GPT Image 2',
      nameEn: 'Relay / GPT Image 2',
      description: 'Custom OpenAI Images-compatible relay, optimized for GPT Image 2 demos.',
      descriptionZh: '面向 GPT Image 2 演示的 OpenAI Images 兼容中转站入口。'
    }
  },
  {
    id: 'custom-image-gemini',
    name: 'Custom Image API (Gemini-compatible)',
    platform: 'Custom',
    image: {
      defaultModel: '',
      protocol: 'custom_image_gemini',
      format: 'custom',
      sizes: WIDE_IMAGE_RATIOS,
      presets: ['gemini-compatible'],
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: '' },
    links: {
      docs: 'https://ai.google.dev/gemini-api/docs/image-generation',
      pricing: 'https://ai.google.dev/gemini-api/docs/pricing'
    },
    billing: { mode: 'unknown', note: 'Custom relay billing depends on the relay provider; configure only trusted HTTPS endpoints.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, relay: true, customBaseUrl: true, integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'templateDependent', maxLength: 2000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '1536', '2048', '4096'],
        modelDependent: true
      })
    },
    customizable: {
      image: {
        auth: ['bearer', 'api-key', 'header', 'query', 'session'],
        baseUrl: true,
        headerName: true,
        model: true,
        pathPrefix: true,
        timeout: true,
        presets: ['gemini-compatible'],
        relayCompatible: true
      }
    },
    meta: { region: 'both', description: 'Custom image relay entry for Gemini-compatible APIs.' }
  },
  {
    id: 'custom-image-ark',
    name: 'Custom Image API (Ark-compatible)',
    platform: 'Custom',
    image: {
      defaultModel: '',
      protocol: 'custom_image_ark',
      format: 'custom',
      sizes: WIDE_IMAGE_RATIOS,
      presets: ['ark-compatible'],
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: '' },
    links: {
      docs: 'https://docs.byteplus.com/en/docs/ModelArk/1541523',
      pricing: 'https://docs.byteplus.com/en/docs/ModelArk/1544106'
    },
    billing: { mode: 'unknown', note: 'Custom relay billing depends on the relay provider; configure only trusted HTTPS endpoints.' },
    capabilities: {
      image: { textToImage: true, imageToImage: true, relay: true, customBaseUrl: true, integrationStatus: 'handler' }
    },
    constraints: {
      image: imageConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'templateDependent', maxLength: 2000 },
        ratios: WIDE_IMAGE_RATIOS,
        resolutions: ['1024', '1536', '2048', '4096'],
        modelDependent: true
      })
    },
    customizable: {
      image: {
        auth: ['bearer', 'api-key', 'header', 'query', 'session'],
        baseUrl: true,
        headerName: true,
        model: true,
        pathPrefix: true,
        timeout: true,
        presets: ['ark-compatible'],
        relayCompatible: true
      }
    },
    meta: { region: 'both', description: 'Custom image relay entry for Ark-compatible APIs.' }
  },
  {
    id: 'custom-video',
    name: 'Custom Video API',
    platform: 'Custom',
    video: {
      defaultModel: '',
      protocol: 'custom_video_task',
      format: 'custom',
      polling: true,
      presets: ['submit-poll-json', 'wan-task', 'qianfan-video-task', 'tencent-tokenhub-video', 'vidu-compatible'],
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: '' },
    links: {
      docs: 'https://www.rfc-editor.org/rfc/rfc9535.html',
      pricing: 'https://replicate.com/pricing'
    },
    billing: { mode: 'unknown', note: 'Custom relay billing depends on the relay provider; configure only trusted HTTPS endpoints.' },
    capabilities: {
      video: { textToVideo: true, imageToVideo: true, async: true, relay: true, customTemplate: true, integrationStatus: 'handler' }
    },
    constraints: {
      video: videoConstraints({
        prompt: { maxLength: 10000 },
        negativePrompt: { supported: true, strategy: 'templateDependent', maxLength: 2000 },
        ratios: VIDEO_RATIOS,
        resolutions: ['480p', '720p', '1080p', '2k'],
        duration: { supported: true, min: 1, max: 30 },
        modelDependent: true
      })
    },
    customizable: {
      video: {
        auth: ['bearer', 'api-key', 'header', 'query', 'session'],
        baseUrl: true,
        headerName: true,
        model: true,
        pathPrefix: true,
        timeout: true,
        pollInterval: true,
        submitPath: true,
        pollPath: true,
        taskIdPath: true,
        statusPath: true,
        videoUrlPath: true,
        allowedTemplateVariables: ['prompt', 'model', 'ratio', 'resolution', 'duration', 'sourceImageUrl', 'negativePrompt'],
        presets: ['wan-task', 'qianfan-video-task', 'tencent-tokenhub-video', 'vidu-compatible'],
        relayCompatible: true
      }
    },
    meta: { region: 'both', description: 'Custom async video relay entry using submit plus poll JSON templates.' }
  },
  {
    id: 'happyhorse',
    name: 'HappyHorse',
    platform: 'HappyHorse',
    video: {
      defaultModel: 'happyhorse-1.0/video',
      protocol: 'happyhorse_task',
      polling: true,
      integrationStatus: 'handler'
    },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://happyhorse.app' },
    links: {
      home: 'https://happyhorse.app',
      docs: 'https://happyhorse.app',
      pricing: 'https://happyhorse.app',
      purchase: 'https://happyhorse.app',
      console: 'https://happyhorse.app',
      apiKey: 'https://happyhorse.app'
    },
    billing: { mode: 'unknown', note: 'Existing video provider; confirm current plans on the official site.' },
    capabilities: {
      video: { textToVideo: true, async: true, polling: true, integrationStatus: 'handler' }
    },
    constraints: {
      video: videoConstraints({
        prompt: { maxLength: 2000 },
        negativePrompt: { supported: false, strategy: 'unsupported' },
        ratios: VIDEO_RATIOS,
        duration: { supported: true, min: 1, max: 30 }
      })
    },
    customizable: { video: { auth: ['bearer'], baseUrl: true, model: true, timeout: true, polling: true } },
    meta: { region: 'global', description: 'Existing HappyHorse video generation provider.' }
  }
]

for (const provider of REGISTRY) attachProviderMeta(provider)

function getProvider(id) {
  return REGISTRY.find(p => p.id === id) || null
}

function getProvidersByAction(action) {
  return REGISTRY.filter(p => p[action])
}

function getProvidersByRegion(region) {
  return REGISTRY.filter(p => p.meta?.region === region || p.meta?.region === 'both')
}

function getDefaultModel(providerId, action) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return null
  return p[action].defaultModel
}

function getModelCatalog(providerId, action) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return []
  return uniqueModelIds([
    p[action].defaultModel,
    ...(Array.isArray(p[action].models) ? p[action].models : []),
    ...(Array.isArray(p.modelCatalog?.[action]) ? p.modelCatalog[action] : []),
    ...(Array.isArray(MODEL_CATALOGS[action]?.[providerId]) ? MODEL_CATALOGS[action][providerId] : [])
  ])
}

function getProviderCallMode(providerId, action, executable = false) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return 'reference'
  const caps = p.capabilities?.[action] || p.meta?.capabilities?.[action] || {}
  if (executable) return p.platform === 'Custom' || p.id?.startsWith('custom-') ? 'custom-api' : 'direct-api'
  if (caps.webSubscription || caps.codingPlan || p.billing?.mode === 'subscription') return 'subscription-reference'
  return 'reference'
}

function getProviderSetupMode(providerId, action, executable = false) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return 'reference'
  const caps = p.capabilities?.[action] || p.meta?.capabilities?.[action] || {}
  const custom = p.customizable?.[action] || p.meta?.customizable?.[action] || {}
  const authOptions = Array.isArray(custom.auth) ? custom.auth : []
  if (!executable) return (caps.webSubscription || caps.codingPlan || p.billing?.mode === 'subscription') ? 'subscription-reference' : 'reference'
  if (p.platform === 'Custom' || p.id?.startsWith('custom-') || custom.customTemplate || caps.customBaseUrl || caps.customTemplate) return 'custom-api'
  if (authOptions.includes('session')) return 'api-key-or-session'
  if (p.authType?.type === 'none') return 'no-auth'
  return 'api-key'
}

function getProtocol(providerId, action) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return null
  return p[action].protocol
}

function getConstraints(providerId, action) {
  const p = getProvider(providerId)
  if (!p) return null
  return p.constraints?.[action] || null
}

module.exports = {
  REGISTRY,
  getProvider,
  getProvidersByAction,
  getProvidersByRegion,
  getDefaultModel,
  getModelCatalog,
  getProviderCallMode,
  getProviderSetupMode,
  getProtocol,
  getConstraints
}
