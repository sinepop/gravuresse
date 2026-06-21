const { app } = require('electron')
const path = require('path')

/**
 * @typedef {Object} AuthType
 * @property {'bearer'|'header'|'query'|'cookie'|'session'} type
 * @property {string} [key]
 * @property {string} [prefix]
 */

/**
 * @typedef {Object} ProviderDef
 * @property {string} id
 * @property {string} name
 * @property {string} platform
 * @property {Object} chat - Chat configuration (if supported)
 * @property {Object} [chat.defaultModel]
 * @property {Object} [chat.protocol]
 * @property {Object} image - Image configuration (if supported)
 * @property {Object} [image.defaultModel]
 * @property {Object} [image.protocol]
 * @property {Object} [image.sizes]
 * @property {Object} video - Video configuration (if supported)
 * @property {Object} [video.defaultModel]
 * @property {Object} [video.protocol]
 * @property {Object} [video.polling]
 * @property {AuthType} authType
 * @property {Object} defaults
 * @property {string} defaults.baseUrl
 * @property {Object} [healthCheck]
 * @property {Object} [meta]
 * @property {string} [meta.region] - 'china' | 'global' | 'both'
 * @property {string} [meta.description]
 */

/** @type {ProviderDef[]} */
const REGISTRY = [
  // ==================== 国际主流 ====================

  // OpenAI — Chat + Image (DALL·E)
  {
    id: 'openai',
    name: 'OpenAI',
    platform: 'OpenAI',
    chat:    { defaultModel: 'gpt-5.1',  protocol: 'openai' },
    image:   { defaultModel: 'dall-e-3', protocol: 'openai_image', sizes: ['1:1', '4:3', '3:4', '16:9', '9:16'] },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.openai.com' },
    meta: { region: 'global', description: 'ChatGPT + DALL·E 图像生成' }
  },

  // Anthropic — Claude
  {
    id: 'anthropic',
    name: 'Anthropic',
    platform: 'Anthropic',
    chat: { defaultModel: 'claude-sonnet-4-6', protocol: 'anthropic', thinking: true },
    authType: { type: 'header', key: 'x-api-key' },
    defaults: { baseUrl: 'https://api.anthropic.com' },
    healthCheck: {
      url: '/v1/messages', method: 'POST',
      body: { max_tokens: 1, model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'ping' }] }
    },
    meta: { region: 'global', description: 'Claude 深度思考与对话' }
  },

  // Google — Gemini (Chat + Image)
  {
    id: 'google',
    name: 'Google Gemini',
    platform: 'Google',
    chat:  { defaultModel: 'gemini-2.5-pro',        protocol: 'gemini' },
    image: { defaultModel: 'gemini-2.5-flash-image', protocol: 'gemini_image' },
    authType: { type: 'query', key: 'key' },
    defaults: { baseUrl: 'https://generativelanguage.googleapis.com' },
    meta: { region: 'global', description: 'Gemini 对话与图像生成' }
  },

  // DeepSeek
  {
    id: 'deepseek',
    name: 'DeepSeek',
    platform: 'DeepSeek',
    chat: { defaultModel: 'deepseek-chat', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.deepseek.com' },
    meta: { region: 'both', description: 'DeepSeek 大语言模型' }
  },

  // Groq — 极速推理
  {
    id: 'groq',
    name: 'Groq',
    platform: 'Groq',
    chat: { defaultModel: 'llama-3.3-70b-versatile', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.groq.com/openai' },
    meta: { region: 'global', description: '极速开源模型推理' }
  },

  // Together AI
  {
    id: 'together',
    name: 'Together AI',
    platform: 'Together',
    chat: { defaultModel: 'meta-llama/Llama-4-17B-128E-Instruct-FP8', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.together.xyz' },
    meta: { region: 'global', description: '开源模型聚合平台' }
  },

  // OpenRouter — 多模型聚合
  {
    id: 'openrouter',
    name: 'OpenRouter',
    platform: 'OpenRouter',
    chat: { defaultModel: 'openai/gpt-5.1', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://openrouter.ai/api' },
    meta: { region: 'global', description: '多模型统一接入' }
  },

  // xAI — Grok
  {
    id: 'xai',
    name: 'xAI Grok',
    platform: 'xAI',
    chat: { defaultModel: 'grok-3', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.x.ai' },
    meta: { region: 'global', description: 'Grok 系列模型' }
  },

  // Perplexity
  {
    id: 'perplexity',
    name: 'Perplexity',
    platform: 'Perplexity',
    chat: { defaultModel: 'sonar-pro', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.perplexity.ai' },
    meta: { region: 'global', description: 'AI 搜索与对话' }
  },

  // ==================== 国内平台 ====================

  // 火山引擎 (Volcengine ARK) — Chat + Image + Video
  {
    id: 'volcengine',
    name: '火山引擎',
    platform: 'Volcengine',
    chat:  { defaultModel: 'doubao-pro-32k',            protocol: 'openai' },
    image: { defaultModel: 'doubao-seedream-4-0',       protocol: 'ark_image', sizes: ['1:1', '4:3', '3:4', '16:9', '9:16'] },
    video: { defaultModel: 'doubao-seedance-2-0-pro',   protocol: 'ark_video_task', polling: true },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
    meta: { region: 'china', description: '豆包 / 即梦 / Seedance — 统一接口' }
  },

  // 阿里云百炼 (Alibaba DashScope) — Qwen
  {
    id: 'alibaba',
    name: '阿里云百炼',
    platform: 'Alibaba',
    chat: { defaultModel: 'qwen-plus', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode' },
    meta: { region: 'china', description: '通义千问系列模型' }
  },

  // Moonshot — Kimi
  {
    id: 'moonshot',
    name: 'Moonshot',
    platform: 'Moonshot',
    chat: { defaultModel: 'kimi-k2-0711-preview', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.moonshot.cn' },
    meta: { region: 'china', description: 'Kimi 长文本对话' }
  },

  // 智谱 (BigModel / Zhipu)
  {
    id: 'zhipu',
    name: '智谱 AI',
    platform: 'Zhipu',
    chat: { defaultModel: 'glm-4-plus', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    meta: { region: 'china', description: 'GLM 系列模型' }
  },

  // 硅基流动 (SiliconFlow)
  {
    id: 'siliconflow',
    name: '硅基流动',
    platform: 'SiliconFlow',
    chat: { defaultModel: 'Qwen/Qwen2.5-72B-Instruct', protocol: 'openai' },
    image: { defaultModel: 'black-forest-labs/FLUX.1-dev', protocol: 'openai_image', sizes: ['1:1', '4:3', '3:4', '16:9', '9:16'] },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.siliconflow.cn' },
    meta: { region: 'china', description: '开源模型低价推理 + 图像生成' }
  },

  // 月之暗面 (已经归到 moonshot，不用重复)
  // 深度求索 (已经归到 deepseek)
  // 零一万物 — Yi
  {
    id: 'lingyi',
    name: '零一万物',
    platform: '01.AI',
    chat: { defaultModel: 'yi-lightning', protocol: 'openai' },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.lingyiwanwu.com' },
    meta: { region: 'china', description: 'Yi 系列模型' }
  },

  // ==================== 视频专用 ====================

  // Runway
  {
    id: 'runway',
    name: 'Runway',
    platform: 'Runway',
    video: { defaultModel: 'gen4-turbo', protocol: 'runway_task', polling: true, imageToVideo: true },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.dev.runwayml.com' },
    meta: { region: 'global', description: 'AI 视频生成' }
  },

  // HappyHorse
  {
    id: 'happyhorse',
    name: 'HappyHorse',
    platform: 'HappyHorse',
    video: { defaultModel: 'happyhorse-1.0/video', protocol: 'happyhorse_task', polling: true },
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://happyhorse.app' },
    meta: { region: 'global', description: 'AI 视频生成' }
  }
]

// ==================== 查询函数 ====================

/** Get a single provider by id */
function getProvider(id) {
  return REGISTRY.find(p => p.id === id) || null
}

/** Get all providers that support a specific action */
function getProvidersByAction(action) {
  return REGISTRY.filter(p => p[action])
}

/** Get all providers by region */
function getProvidersByRegion(region) {
  return REGISTRY.filter(p => p.meta?.region === region || p.meta?.region === 'both')
}

/** Get the default model for a provider's action */
function getDefaultModel(providerId, action) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return null
  return p[action].defaultModel
}

/** Get the protocol for a provider's action */
function getProtocol(providerId, action) {
  const p = getProvider(providerId)
  if (!p || !p[action]) return null
  return p[action].protocol
}

module.exports = {
  REGISTRY,
  getProvider,
  getProvidersByAction,
  getProvidersByRegion,
  getDefaultModel,
  getProtocol
}
