import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { PROVIDER_ID_ALIASES } from '../providers/aliases'
import { t } from '../i18n'
import Ic from './icons'

const NAV_SECTIONS = [
  { id: 'api', labelKey: 'apiConfig', icon: 'link', children: [
    { id: 'api-chat', labelKey: 'chat' },
    { id: 'api-image', labelKey: 'image' },
    { id: 'api-video', labelKey: 'video', requiresVideo: true },
  ]},
  { id: 'general', labelKey: 'general', icon: 'gear', children: [
    { id: 'appearance', labelKey: 'appearance' },
    { id: 'lang', labelKey: 'language' },
    { id: 'other', labelKey: 'other' },
  ]},
]

const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2']
const STYLE_PRESETS = ['扁平插画', '3D 渲染', '写实摄影', '水彩画', '动漫风', '像素艺术', '油画', '极简主义', '赛博朋克', '剪纸']
const DURATIONS = ['5s', '8s', '10s']
const REDACTED_API_KEY = '********'
const LINK_BUTTONS = [
  { key: 'home', labelKey: 'officialSite', icon: 'globe' },
  { key: 'docs', labelKey: 'docs', icon: 'book' },
  { key: 'pricing', labelKey: 'pricing', icon: 'price' },
  { key: 'purchase', labelKey: 'purchaseTopup', icon: 'card' },
  { key: 'console', labelKey: 'console', icon: 'server' },
  { key: 'apiKey', labelKey: 'apiKeyPage', icon: 'key' },
  { key: 'codingPlan', labelKey: 'codingPlan', icon: 'book' },
  { key: 'openCode', labelKey: 'openCode', icon: 'external' },
  { key: 'jimeng', labelKey: 'jimeng', icon: 'sparkle' },
]

const DOMESTIC_PROVIDER_ORDER = [
  'volcengine',
  'alibaba-wan',
  'baidu-qianfan',
  'tencent-tokenhub',
  'vidu',
  'minimax',
  'kling',
  'pixverse',
  'siliconflow',
  'custom-image-ark',
  'custom-video'
]

const MAINSTREAM_PROVIDER_IDS = {
  chat: [
    'openai',
    'anthropic',
    'google',
    'deepseek',
    'alibaba',
    'moonshot',
    'volcengine',
    'openrouter',
    'groq',
    'together',
    'xai',
    'perplexity',
    'siliconflow',
    'opencode-go',
    'volcengine-coding-plan',
    'chatgpt-plans',
    'claude-plans'
  ],
  image: [
    'openai',
    'google',
    'volcengine',
    'alibaba-wan',
    'baidu-qianfan',
    'stability',
    'ideogram',
    'fal',
    'replicate',
    'siliconflow'
  ],
  video: [
    'volcengine',
    'alibaba-wan',
    'runway',
    'kling',
    'luma',
    'minimax',
    'pixverse',
    'fal',
    'replicate',
    'baidu-qianfan',
    'tencent-tokenhub'
  ]
}

const AGGREGATOR_PROVIDER_IDS = ['openrouter', 'together', 'fal', 'replicate']

const FALLBACK_PROVIDER_METADATA = {
  openai: {
    links: {
      home: 'https://openai.com',
      docs: 'https://developers.openai.com/api/docs/guides/image-generation',
      pricing: 'https://openai.com/api/pricing/',
      purchase: 'https://platform.openai.com/settings/organization/billing/overview',
      console: 'https://platform.openai.com',
      apiKey: 'https://platform.openai.com/api-keys'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'global' },
    relayCompatible: true
  },
  google: {
    links: {
      home: 'https://ai.google.dev/gemini-api',
      docs: 'https://ai.google.dev/gemini-api/docs/image-generation',
      pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
      console: 'https://aistudio.google.com',
      apiKey: 'https://aistudio.google.com/app/apikey'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'global' }
  },
  volcengine: {
    links: {
      home: 'https://www.volcengine.com/product/ark',
      docs: 'https://www.volcengine.com/docs/82379/1520757?lang=zh',
      pricing: 'https://www.volcengine.com/docs/82379/1544106?lang=zh',
      console: 'https://console.volcengine.com/ark',
      apiKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
      jimeng: 'https://www.volcengine.com/product/jimeng'
    },
    billing: { mode: 'paygo', noteZh: '火山方舟 API 按官方接口计费。' },
    meta: { region: 'china', nameZh: '火山方舟', nameEn: 'Volcengine ModelArk', descriptionZh: '火山方舟 API，支持豆包对话、Seedream 生图和 Seedance 视频。', description: 'Volcengine ModelArk API for Doubao, Seedream, and Seedance.' },
    relayCompatible: true
  },
  siliconflow: {
    links: {
      home: 'https://www.siliconflow.com',
      docs: 'https://docs.siliconflow.cn/en/api-reference/images/images-generations',
      pricing: 'https://www.siliconflow.com/pricing',
      console: 'https://cloud.siliconflow.cn',
      apiKey: 'https://cloud.siliconflow.cn/account/ak'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'china' },
    relayCompatible: true
  },
  stability: {
    links: {
      home: 'https://platform.stability.ai',
      docs: 'https://platform.stability.ai/docs/api-reference',
      pricing: 'https://platform.stability.ai/pricing',
      console: 'https://platform.stability.ai',
      apiKey: 'https://platform.stability.ai/account/keys'
    },
    billing: { mode: 'credits' },
    meta: { region: 'global' }
  },
  ideogram: {
    links: {
      home: 'https://ideogram.ai/api',
      docs: 'https://developer.ideogram.ai/ideogram-api/api-overview',
      pricing: 'https://ideogram.ai/api-pricing/',
      console: 'https://ideogram.ai',
      apiKey: 'https://ideogram.ai/manage-api'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'global' }
  },
  runway: {
    links: {
      home: 'https://runwayml.com/api',
      docs: 'https://docs.dev.runwayml.com',
      pricing: 'https://docs.dev.runwayml.com/guides/pricing/',
      purchase: 'https://dev.runwayml.com',
      console: 'https://dev.runwayml.com',
      apiKey: 'https://dev.runwayml.com'
    },
    billing: { mode: 'credits' },
    meta: { region: 'global' }
  },
  luma: {
    links: {
      home: 'https://lumalabs.ai/api',
      docs: 'https://docs.lumalabs.ai/docs/welcome',
      purchase: 'https://lumalabs.ai/dream-machine/api/billing/overview',
      console: 'https://lumalabs.ai/dream-machine/api',
      apiKey: 'https://lumalabs.ai/dream-machine/api/keys'
    },
    billing: { mode: 'credits' },
    meta: { region: 'global' }
  },
  alibaba: {
    links: {
      home: 'https://www.alibabacloud.com/product/modelstudio',
      docs: 'https://www.alibabacloud.com/help/en/model-studio/use-video-generation',
      pricing: 'https://www.alibabacloud.com/help/en/model-studio/models',
      console: 'https://bailian.console.aliyun.com',
      apiKey: 'https://bailian.console.aliyun.com'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'china' }
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
    billing: { mode: 'paygo' },
    meta: { region: 'china' }
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
    billing: { mode: 'paygo' },
    meta: { region: 'china' }
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
    billing: { mode: 'paygo' },
    meta: { region: 'china' }
  },
  vidu: {
    links: {
      home: 'https://platform.vidu.cn',
      docs: 'https://platform.vidu.cn',
      pricing: 'https://platform.vidu.cn',
      purchase: 'https://platform.vidu.cn',
      console: 'https://platform.vidu.cn',
      apiKey: 'https://platform.vidu.cn'
    },
    billing: { mode: 'subscription' },
    meta: { region: 'china' }
  },
  minimax: {
    links: {
      home: 'https://platform.minimax.io',
      docs: 'https://platform.minimax.io/docs/guides/video-generation',
      pricing: 'https://platform.minimax.io/docs/guides/pricing-video',
      purchase: 'https://platform.minimax.io/docs/guides/pricing-video',
      console: 'https://platform.minimax.io'
    },
    billing: { mode: 'subscription' },
    meta: { region: 'global' }
  },
  kling: {
    links: {
      home: 'https://kling.ai',
      docs: 'https://kling.ai/document-api/quickStart/productIntroduction/overview',
      pricing: 'https://kling.ai/dev/pricing',
      purchase: 'https://kling.ai/dev/pricing',
      console: 'https://kling.ai/dev'
    },
    billing: { mode: 'credits' },
    meta: { region: 'global' }
  },
  pixverse: {
    links: {
      home: 'https://platform.pixverse.ai',
      docs: 'https://docs.platform.pixverse.ai',
      pricing: 'https://docs.platform.pixverse.ai/pricing-796039m0',
      purchase: 'https://platform.pixverse.ai/billing',
      console: 'https://platform.pixverse.ai'
    },
    billing: { mode: 'subscription' },
    meta: { region: 'global' }
  },
  fal: {
    links: {
      home: 'https://fal.ai',
      docs: 'https://fal.ai/docs/documentation',
      pricing: 'https://fal.ai/pricing',
      purchase: 'https://fal.ai/dashboard/billing',
      console: 'https://fal.ai/dashboard',
      apiKey: 'https://fal.ai/dashboard/keys'
    },
    billing: { mode: 'credits' },
    meta: { region: 'global' },
    relayCompatible: true
  },
  replicate: {
    links: {
      home: 'https://replicate.com',
      docs: 'https://replicate.com/docs',
      pricing: 'https://replicate.com/pricing',
      purchase: 'https://replicate.com/account/billing',
      console: 'https://replicate.com/account',
      apiKey: 'https://replicate.com/account/api-tokens'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'global' },
    relayCompatible: true
  },
}

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
    },
    happyhorse: {
      links: {
        home: 'https://happyhorse.app',
        docs: 'https://fal.ai/happyhorse-1.0',
        pricing: 'https://fal.ai/happyhorse-1.0'
      },
      billing: { mode: 'credits' },
      capabilities: { video: { textToVideo: true, imageToVideo: true, async: true } }
    }
  }
}

function resolveProviderId(track, id, providers) {
  if (!id) return providers[0]?.id || ''
  if (providers.some(provider => provider.id === id)) return id
  const canonicalId = PROVIDER_ID_ALIASES[track]?.[id]
  if (canonicalId && providers.some(provider => provider.id === canonicalId)) return canonicalId
  const legacyId = Object.entries(PROVIDER_ID_ALIASES[track] || {})
    .find(([, canonical]) => canonical === id)?.[0]
  if (legacyId && providers.some(provider => provider.id === legacyId)) return legacyId
  return providers[0]?.id || ''
}

function isExecutableProvider(provider) {
  return Boolean(provider) && provider.executable !== false && provider.integrationStatus !== 'metadata'
}

function providerInfo(provider = {}, track) {
  const base = FALLBACK_PROVIDER_METADATA[provider.id] || {}
  const trackMeta = TRACK_PROVIDER_METADATA[track]?.[provider.id] || {}
  const capabilities = provider.capabilities?.[track] || provider.meta?.capabilities?.[track] || trackMeta.capabilities?.[track] || {}
  const customizable = provider.customizable?.[track] || provider.meta?.customizable?.[track] || trackMeta.customizable?.[track] || {}
  const billing = provider.billing || provider.meta?.billing || trackMeta.billing || base.billing || { mode: 'unknown' }
  return {
    links: { ...(base.links || {}), ...(trackMeta.links || {}), ...(provider.meta?.links || {}), ...(provider.links || {}) },
    billing,
    region: provider.meta?.region || trackMeta.meta?.region || base.meta?.region || 'unknown',
    capabilities,
    constraints: provider.constraints?.[track] || provider.meta?.constraints?.[track] || trackMeta.constraints || {},
    customizable,
    description: provider.meta?.description || base.meta?.description || '',
    descriptionZh: provider.meta?.descriptionZh || base.meta?.descriptionZh || '',
    descriptionEn: provider.meta?.descriptionEn || provider.meta?.description || base.meta?.descriptionEn || base.meta?.description || '',
    nameZh: provider.meta?.nameZh || base.meta?.nameZh || '',
    nameEn: provider.meta?.nameEn || base.meta?.nameEn || '',
    relay: provider.relayCompatible || base.relayCompatible || capabilities.relay || customizable.relayCompatible
  }
}

function hasCjk(text = '') {
  return /[\u4e00-\u9fff]/.test(text)
}

function providerDisplayName(provider = {}, lang, track = 'chat') {
  if (provider.id === 'volcengine') {
    if (track === 'image') return lang === 'en' ? 'Seedream / Jimeng' : 'Seedream / 即梦'
    if (track === 'video') return lang === 'en' ? 'Seedance / Jimeng' : 'Seedance / 即梦'
    return lang === 'en' ? 'Doubao / Volcengine ModelArk' : '豆包 / 火山方舟'
  }
  const info = providerInfo(provider, track)
  if (lang === 'en') {
    if (info.nameEn || provider.nameEn) return info.nameEn || provider.nameEn
    const part = String(provider.name || '').split('/').map(item => item.trim()).find(item => item && !hasCjk(item))
    return part || provider.name || ''
  }
  if (info.nameZh || provider.nameZh) return info.nameZh || provider.nameZh
  const part = String(provider.name || '').split('/').map(item => item.trim()).find(item => item && hasCjk(item))
  return part || provider.name || ''
}

function localizedDescription(info, lang) {
  if (lang === 'en') return info.descriptionEn || info.description || ''
  return info.descriptionZh || ''
}

function localizedBillingNote(info, lang) {
  if (lang === 'en') return info.billing?.noteEn || info.billing?.note || t('billingOfficialNote', lang)
  return info.billing?.noteZh || t('billingOfficialNote', lang)
}

function providerIcon(track) {
  if (track === 'image') return 'image'
  if (track === 'video') return 'film'
  return 'chat'
}

function hasTemplatePreset(provider, info) {
  return Boolean(
    provider?.platform === 'Custom' ||
    provider?.id === 'vidu' ||
    info.capabilities?.customTemplate ||
    info.capabilities?.integrationStatus === 'relay' ||
    info.customizable?.submitPath ||
    info.customizable?.allowedTemplateVariables
  )
}

function sortProvidersForWorkbench(providers, track) {
  return sortProvidersForTrack(providers, track)
}

function filterMainstreamProviders(providers, track, currentId) {
  const allowed = new Set(MAINSTREAM_PROVIDER_IDS[track] || [])
  const currentKey = canonicalProviderKey(track, currentId)
  return providers.filter(provider => {
    const key = canonicalProviderKey(track, provider.id)
    return allowed.has(key) || key === currentKey
  })
}

function providerCategoryRank(provider, track) {
  const key = canonicalProviderKey(track, provider.id)
  const info = providerInfo(provider, track)
  if (info.region === 'china' || info.region === 'both') return 0
  if (AGGREGATOR_PROVIDER_IDS.includes(key) || info.relay) return 2
  return 1
}

function billingGroup(provider, track) {
  const mode = providerInfo(provider, track).billing?.mode
  return mode === 'subscription' ? 'subscription' : 'usage'
}

function sortProvidersForTrack(providers, track, current = {}) {
  const order = MAINSTREAM_PROVIDER_IDS[track] || []
  return [...providers].map((provider, index) => ({ provider, index, info: providerInfo(provider, track) }))
    .sort((a, b) => {
      const aConfigured = currentMatchesProvider(track, current, a.provider) && hasCredential(current)
      const bConfigured = currentMatchesProvider(track, current, b.provider) && hasCredential(current)
      const aExecutable = isExecutableProvider(a.provider)
      const bExecutable = isExecutableProvider(b.provider)
      const aKey = canonicalProviderKey(track, a.provider.id)
      const bKey = canonicalProviderKey(track, b.provider.id)
      const aOrder = order.indexOf(aKey)
      const bOrder = order.indexOf(bKey)
      return Number(bConfigured) - Number(aConfigured) ||
        Number(bExecutable) - Number(aExecutable) ||
        providerCategoryRank(a.provider, track) - providerCategoryRank(b.provider, track) ||
        (aOrder === -1 ? 100 : aOrder) - (bOrder === -1 ? 100 : bOrder) ||
        a.index - b.index
    })
    .map(item => item.provider)
}

function regionLabel(region, lang) {
  if (region === 'global') return t('regionGlobal', lang)
  if (region === 'china') return t('regionChina', lang)
  if (region === 'both') return t('regionBoth', lang)
  return t('regionUnknown', lang)
}

function billingLabel(mode, lang) {
  if (mode === 'paygo') return t('billingPaygo', lang)
  if (mode === 'credits') return t('billingCredits', lang)
  if (mode === 'subscription') return t('billingSubscription', lang)
  return t('billingUnknown', lang)
}

function capabilityLabels(caps, track, lang) {
  const items = []
  if (caps.textToImage) items.push(t('capTextToImage', lang))
  if (caps.imageEdit || caps.imageToImage) items.push(t('capImageEdit', lang))
  if (caps.textToVideo) items.push(t('capTextToVideo', lang))
  if (caps.imageToVideo) items.push(t('capImageToVideo', lang))
  if (caps.async || caps.polling) items.push(t('capAsyncTask', lang))
  if (caps.modelList) items.push(t('capModelList', lang))
  if (caps.relay || caps.customBaseUrl || caps.customTemplate) items.push(t('relayCustom', lang))
  if (!items.length) items.push(track === 'image' ? t('capTextToImage', lang) : t('capTextToVideo', lang))
  return items
}

function compactConstraints(constraints, lang) {
  const items = []
  if (constraints.prompt?.maxLength) items.push(`${t('promptLimit', lang)} ${constraints.prompt.maxLength}`)
  const duration = constraints.duration
  if (duration?.allowed?.length) items.push(`${t('durationLimit', lang)} ${duration.allowed.join('/')}s`)
  else if (duration?.min || duration?.max) items.push(`${t('durationLimit', lang)} ${duration.min || 1}-${duration.max || '?'}s`)
  if (constraints.negativePrompt) {
    items.push(constraints.negativePrompt.supported ? t('negativePromptSupported', lang) : t('negativePromptUnsupported', lang))
  }
  return items
}

function chipS(color = 'var(--text-muted)') {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px',
    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)', color, fontSize: 10, lineHeight: 1.3
  }
}

function billingChipS(mode, track) {
  const highRisk = track === 'video' || mode === 'subscription'
  if (mode === 'paygo') return { ...chipS('var(--success)'), borderColor: 'var(--success-soft)', background: 'var(--success-soft)' }
  if (mode === 'credits') return { ...chipS(highRisk ? 'var(--danger)' : 'var(--accent)'), borderColor: highRisk ? 'var(--danger-border)' : 'var(--border-accent)', background: highRisk ? 'var(--danger-soft)' : 'var(--accent-soft)' }
  if (mode === 'subscription') return { ...chipS('var(--danger)'), borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }
  return { ...chipS('var(--text-muted)'), borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }
}

function openExternal(url) {
  if (!url) return
  window.electronAPI?.openExternal?.(url).catch?.(() => {})
}

/* ── reusable styles (all CSS variables) ── */
const labelS = () => ({ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: '0.2px' })
const inputS = () => ({ background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', transition: 'all 0.2s ease', lineHeight: 1.5 })
const selectS = () => ({ ...inputS(), appearance: 'auto', cursor: 'pointer', fontFamily: 'var(--font-body)' })
const btnS = (primary) => ({ padding: '8px 22px', background: primary ? 'var(--accent-gradient)' : 'var(--bg-surface)', border: primary ? 'none' : '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: primary ? 'var(--text-white)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: primary ? 600 : 400, transition: 'all 0.2s ease', boxShadow: primary ? 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none' })

const TRACKS = ['chat', 'image', 'video']

function canonicalProviderKey(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id || ''
}

function currentMatchesProvider(track, current = {}, provider) {
  if (!provider || !current?.id) return false
  return canonicalProviderKey(track, current.id) === canonicalProviderKey(track, provider.id)
}

function hasCredential(current = {}) {
  return current.customAuth?.type === 'session' ? Boolean(current.sessionToken) : Boolean(current.apiKey)
}

function profileKey(track, profile = {}) {
  return [
    track,
    canonicalProviderKey(track, profile.providerId || profile.id),
    profile.baseUrl || '',
    profile.model || ''
  ].join('|')
}

function profileMatchesProvider(track, profile = {}, provider) {
  if (!provider || !profile?.providerId) return false
  return canonicalProviderKey(track, profile.providerId) === canonicalProviderKey(track, provider.id)
}

function profileToProviderPatch(profile = {}) {
  return {
    id: profile.providerId,
    apiKey: profile.apiKey || '',
    sessionToken: profile.sessionToken || '',
    baseUrl: profile.baseUrl || '',
    model: profile.model || '',
    protocol: profile.protocol,
    format: profile.format,
    customAuth: profile.customAuth || {},
    template: profile.template,
    pathPrefix: profile.pathPrefix || '',
    timeout: profile.timeout || '',
    pollInterval: profile.pollInterval || '',
    defaultNegPrompt: profile.defaultNegPrompt || '',
    customSystemPrompt: profile.customSystemPrompt || ''
  }
}

function ProviderCard({ track, provider, selected, onSelect, lang }) {
  const info = providerInfo(provider, track)
  const executable = isExecutableProvider(provider)
  const caps = capabilityLabels(info.capabilities, track, lang)
  const constraints = compactConstraints(info.constraints, lang)
  const description = localizedDescription(info, lang)
  const linkButtons = LINK_BUTTONS.filter(button => {
    if (!info.links?.[button.key]) return false
    if (provider.id === 'volcengine' && (button.key === 'codingPlan' || button.key === 'openCode')) return false
    if (provider.id === 'volcengine-coding-plan' && button.key === 'openCode') return false
    return true
  })
  const templatePreset = hasTemplatePreset(provider, info)

  return (
    <div style={{
      border: `1px solid ${selected ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
      background: selected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
      borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
            <Ic n={providerIcon(track)} size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{providerDisplayName(provider, lang, track)}</span>
          </div>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 10 }}>{provider.platform} · {regionLabel(info.region, lang)}</div>
        </div>
        <button
          onClick={() => onSelect(provider)}
          title={executable ? t('provider', lang) : t('viewMaterials', lang)}
          style={{
            ...btnS(false),
            padding: '5px 8px',
            fontSize: 11,
            color: selected ? 'var(--accent)' : 'var(--text-secondary)'
          }}
        >
          {selected ? <Ic n="check" size={12} /> : executable ? <Ic n="plus" size={12} /> : <Ic n="book" size={12} />}
        </button>
      </div>

      {description && <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45 }}>{description}</div>}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span style={chipS(executable ? 'var(--success)' : 'var(--text-muted)')}>{executable ? t('directCallable', lang) : t('metadataOnly', lang)}</span>
        <span style={billingChipS(info.billing?.mode, track)}>{billingLabel(info.billing?.mode, lang)}</span>
        <span style={chipS(info.relay || templatePreset ? 'var(--success)' : 'var(--text-muted)')}>
          {templatePreset ? t('templatePreset', lang) : info.relay ? t('relaySupported', lang) : t('relayOfficialOnly', lang)}
        </span>
      </div>

      {(track === 'video' || info.billing?.mode === 'subscription') && (
        <div style={{ color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 10, lineHeight: 1.45 }}>
          {localizedBillingNote(info, lang)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {caps.slice(0, 5).map(item => <span key={item} style={chipS()}>{item}</span>)}
      </div>

      {constraints.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {constraints.slice(0, 3).map(item => <span key={item} style={chipS()}>{item}</span>)}
        </div>
      )}

      {linkButtons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {linkButtons.map(button => (
            <button key={button.key} onClick={() => openExternal(info.links[button.key])} style={{ ...btnS(false), padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Ic n={button.icon} size={11} />{t(button.labelKey, lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProviderWorkbench({ track, providers, selectedProviderId, onSelect, lang }) {
  const orderedProviders = providers
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{t('apiWorkbench', lang)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{t('apiWorkbenchDesc', lang)}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        {orderedProviders.map(p => (
          <ProviderCard
            key={p.id}
            track={track}
            provider={p}
            selected={p.id === selectedProviderId}
            onSelect={onSelect}
            lang={lang}
          />
        ))}
      </div>
    </div>
  )
}

function CustomApiFields({ track, provider, current, onChange, lang }) {
  const info = providerInfo(provider, track)
  const isCustom = provider?.platform === 'Custom' || provider?.id?.startsWith('custom-')
  if (!isCustom && !info.capabilities?.customTemplate && !info.capabilities?.customBaseUrl) return null

  const customAuth = current.customAuth || {}
  const template = current.template || current.customTemplate || {}
  const patchAuth = (patch) => onChange(track, { customAuth: { ...customAuth, ...patch } })
  const patchTemplate = (patch) => onChange(track, { template: { ...template, ...patch } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={labelS()}>
        {t('authMode', lang)}
        <select value={customAuth.type || ''} onChange={e => patchAuth(e.target.value ? { type: e.target.value } : { type: '' })} style={selectS()}>
          <option value="">{t('authBearer', lang)}</option>
          <option value="bearer">{t('authBearer', lang)}</option>
          <option value="api-key">{t('authApiKey', lang)}</option>
          <option value="header">{t('authHeader', lang)}</option>
          <option value="session">{t('authSession', lang)}</option>
        </select>
      </label>
      {(customAuth.type === 'api-key' || customAuth.type === 'header') && (
        <label style={labelS()}>
          {t('headerName', lang)}
          <input type="text" value={customAuth.headerName || customAuth.key || ''} placeholder="x-api-key" onChange={e => patchAuth({ headerName: e.target.value })} style={inputS()} />
        </label>
      )}
      {customAuth.type === 'session' && (
        <label style={labelS()}>
          {t('sessionHeaderName', lang)}
          <input type="text" value={customAuth.sessionHeaderName || customAuth.headerName || customAuth.key || ''} placeholder="X-Session-Token" onChange={e => patchAuth({ sessionHeaderName: e.target.value })} style={inputS()} />
        </label>
      )}
      <label style={labelS()}>
        {t('pathPrefix', lang)}
        <input type="text" value={current.pathPrefix || ''} placeholder="/v1" onChange={e => onChange(track, { pathPrefix: e.target.value })} style={inputS()} />
      </label>
      <label style={labelS()}>
        {t('requestTimeout', lang)}
        <input type="number" min="1000" step="1000" value={current.timeout || ''} placeholder="60000" onChange={e => onChange(track, { timeout: e.target.value ? Number(e.target.value) : '' })} style={inputS()} />
      </label>
      {track === 'video' && (
        <>
          <label style={labelS()}>
            {t('pollInterval', lang)}
            <input type="number" min="1000" step="1000" value={current.pollInterval || ''} placeholder="5000" onChange={e => onChange(track, { pollInterval: e.target.value ? Number(e.target.value) : '' })} style={inputS()} />
          </label>
          <label style={labelS()}>
            {t('submitPath', lang)}
            <input type="text" value={template.submitPath || ''} placeholder="/v1/videos" onChange={e => patchTemplate({ submitPath: e.target.value })} style={inputS()} />
          </label>
          <label style={labelS()}>
            {t('pollPath', lang)}
            <input type="text" value={template.pollPath || ''} placeholder="/v1/videos/{taskId}" onChange={e => patchTemplate({ pollPath: e.target.value })} style={inputS()} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelS()}>
              {t('taskIdPath', lang)}
              <input type="text" value={template.taskIdPath || ''} placeholder="$.data.id" onChange={e => patchTemplate({ taskIdPath: e.target.value })} style={inputS()} />
            </label>
            <label style={labelS()}>
              {t('statusPath', lang)}
              <input type="text" value={template.statusPath || ''} placeholder="$.data.status" onChange={e => patchTemplate({ statusPath: e.target.value })} style={inputS()} />
            </label>
          </div>
          <label style={labelS()}>
            {t('videoUrlPath', lang)}
            <input type="text" value={template.videoUrlPath || ''} placeholder="$.data.video_url" onChange={e => patchTemplate({ videoUrlPath: e.target.value })} style={inputS()} />
          </label>
        </>
      )}
    </div>
  )
}

/* ── ProviderTab ── */
function TrackStatusPanel({ track, provider, current, lang }) {
  const info = providerInfo(provider, track)
  const configured = hasCredential(current)
  const model = current.model || provider?.defaultModel || t('noConfig', lang)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
      gap: 10,
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)',
      padding: 12
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }}>
          <Ic n={providerIcon(track)} size={14} />
          <span>{t(`${track}Model`, lang)}</span>
        </div>
        <div style={{ marginTop: 5, color: 'var(--text-secondary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {provider ? providerDisplayName(provider, lang, track) : t('noConfig', lang)}
        </div>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <span style={chipS(configured ? 'var(--success)' : 'var(--text-muted)')}>{configured ? t('configured', lang) : t('notConfigured', lang)}</span>
        <span style={billingChipS(info.billing?.mode, track)}>{billingLabel(info.billing?.mode, lang)}</span>
        <div style={{ maxWidth: '100%', color: 'var(--text-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model}</div>
      </div>
    </div>
  )
}

function SectionHeading({ labelKey, lang }) {
  return (
    <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)' }}>
      {t(labelKey, lang)}
    </div>
  )
}

function PresetBadge({ show, lang }) {
  if (!show) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 6px', borderRadius: 'var(--radius-sm)',
      background: 'var(--accent-soft)', color: 'var(--accent)',
      fontSize: 10, lineHeight: 1.4, fontWeight: 500, marginLeft: 4,
      fontFamily: 'var(--font-body)'
    }}>
      <Ic n="check" size={9} />{t('presetValue', lang)}
    </span>
  )
}

function NonExecutableInfoCard({ provider, track, lang }) {
  const info = providerInfo(provider, track)
  const linkButtons = LINK_BUTTONS.filter(button => info.links?.[button.key])

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      background: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-sm)',
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <SectionHeading labelKey="currentProviderConfig" lang={lang} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ic n={providerIcon(track)} size={14} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {providerDisplayName(provider, lang, track)}
        </span>
      </div>
      {localizedDescription(info, lang) && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
          {localizedDescription(info, lang)}
        </div>
      )}
      {linkButtons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {linkButtons.map(button => (
            <button key={button.key} onClick={() => openExternal(info.links[button.key])}
              style={{ ...btnS(false), padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Ic n={button.icon} size={11} />{t(button.labelKey, lang)}
            </button>
          ))}
        </div>
      )}
      {(track === 'video' || info.billing?.mode === 'subscription') && localizedBillingNote(info, lang) && (
        <div style={{ color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', fontSize: 11, lineHeight: 1.5 }}>
          {localizedBillingNote(info, lang)}
        </div>
      )}
    </div>
  )
}

function ProviderTab({ track, providers, config, onChange, lang }) {
  const current = config?.providers?.[track] || {}
  const allVisibleProviders = sortProvidersForTrack(filterMainstreamProviders(providers, track, current.id), track, current)
  const currentProvider = allVisibleProviders.find(p => currentMatchesProvider(track, current, p))
  const currentBillingGroup = currentProvider ? billingGroup(currentProvider, track) : 'usage'
  const [billingView, setBillingView] = useState(currentBillingGroup)
  useEffect(() => {
    setBillingView(currentBillingGroup)
  }, [current.id, currentBillingGroup])
  const billingCounts = {
    usage: allVisibleProviders.filter(p => billingGroup(p, track) === 'usage').length,
    subscription: allVisibleProviders.filter(p => billingGroup(p, track) === 'subscription').length
  }
  const visibleProviders = allVisibleProviders.filter(p => billingGroup(p, track) === billingView)
  const selectableProviders = visibleProviders.filter(isExecutableProvider)
  const selectable = selectableProviders.length ? selectableProviders : visibleProviders
  const selectedProviderId = resolveProviderId(track, current.id, selectable)
  const provider = visibleProviders.find(p => p.id === selectedProviderId) || selectable[0] || allVisibleProviders[0]
  const apiKeyRedacted = current.apiKey === REDACTED_API_KEY
  const apiKeyValue = apiKeyRedacted ? '' : current.apiKey || ''
  const usesSessionAuth = current.customAuth?.type === 'session'
  const sessionTokenRedacted = current.sessionToken === REDACTED_API_KEY
  const sessionTokenValue = sessionTokenRedacted ? '' : current.sessionToken || ''
  const hasCredential = usesSessionAuth ? Boolean(current.sessionToken) : Boolean(current.apiKey)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [models, setModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fetchTimeout = useRef(null)

  const fetchModelList = useCallback(async () => {
    if (!hasCredential || !current.baseUrl) { setModels([]); return }
    setLoadingModels(true)
    try {
      const list = await window.electronAPI.fetchModels({
        ...current,
        id: selectedProviderId,
        track,
        format: provider?.format,
        protocol: provider?.protocol,
        model: current.model || provider?.defaultModel
      })
      setModels(list || [])
      if (list?.length > 0 && !current.model) {
        onChange(track, { model: list[0].id })
      }
    } catch { setModels([]) }
    finally { setLoadingModels(false) }
  }, [current, hasCredential, provider?.defaultModel, provider?.format, provider?.protocol, selectedProviderId, onChange, track])

  useEffect(() => {
    if (hasCredential && current.baseUrl) {
      clearTimeout(fetchTimeout.current)
      fetchTimeout.current = setTimeout(fetchModelList, 600)
    }
    return () => clearTimeout(fetchTimeout.current)
  }, [current.id, current.apiKey, current.sessionToken, current.baseUrl, hasCredential, fetchModelList])

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const params = {
        ...current,
        id: selectedProviderId,
        providerId: selectedProviderId,
        track,
        format: provider?.format,
        protocol: provider?.protocol,
        model: current.model || provider?.defaultModel
      }
      const test = await window.electronAPI.providerAPI?.test?.(params)
      if (test && test.ok === false) {
        setTestResult({ ok: false, msg: test.message || t('testFail', lang) })
        return
      }
      const list = await window.electronAPI.fetchModels(params)
      setModels(list || [])
      setTestResult({ ok: true, count: list?.length || 0 })
    } catch (e) { setTestResult({ ok: false, msg: e.message }) }
    finally { setTesting(false) }
  }

  const handleClear = () => {
    if (window.confirm(t('clearConfirm', lang))) {
      onChange(track, { apiKey: '', sessionToken: '', customAuth: {}, baseUrl: '', model: '' })
      setModels([])
      setTestResult(null)
    }
  }

  const handleRestoreUrl = () => {
    if (provider?.defaultUrl) onChange(track, { baseUrl: provider.defaultUrl })
  }

  const selectProvider = (p) => {
    onChange(track, { id: p.id, apiKey: '', sessionToken: '', customAuth: {}, baseUrl: p.defaultUrl || '', model: p.defaultModel || '', protocol: p.protocol, format: p.format })
    setModels([])
    setTestResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TrackStatusPanel track={track} provider={provider} current={current} lang={lang} />

      {/* ── Current Provider Config ── */}
      {!isExecutableProvider(provider) ? (
        <NonExecutableInfoCard provider={provider} track={track} lang={lang} />
      ) : (
        <>
          <SectionHeading labelKey="currentProviderConfig" lang={lang} />
          <label style={labelS()}>
            {t('apiKey', lang)}
            <input type="password" value={apiKeyValue} placeholder={apiKeyRedacted ? t('configuredPlaceholder', lang) : 'sk-...'} onChange={e => onChange(track, { apiKey: e.target.value })} style={inputS()} />
          </label>
          {usesSessionAuth && (
            <label style={labelS()}>
              {t('sessionToken', lang)}
              <input type="password" value={sessionTokenValue} placeholder={sessionTokenRedacted ? t('configuredPlaceholder', lang) : 'sess-...'} onChange={e => onChange(track, { sessionToken: e.target.value })} style={inputS()} />
            </label>
          )}
          <label style={labelS()}>
            <span>{t('baseUrl', lang)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({t('optional', lang)})</span><PresetBadge show={current.baseUrl === provider?.defaultUrl && Boolean(provider?.defaultUrl)} lang={lang} /></span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={current.baseUrl || ''} placeholder={provider?.defaultUrl || ''} onChange={e => onChange(track, { baseUrl: e.target.value })} style={{ ...inputS(), flex: 1 }} />
              <button onClick={handleRestoreUrl} title={t('restoreDefault', lang)} style={{ padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                <Ic n="refresh" size={12} />
              </button>
            </div>
          </label>
          <label style={labelS()}>
            <span>{t('model', lang)}<PresetBadge show={current.model === provider?.defaultModel && Boolean(provider?.defaultModel)} lang={lang} /></span>
            {models.length > 0 ? (
              <select value={current.model || ''} onChange={e => onChange(track, { model: e.target.value })} style={selectS()}>
                {models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="text" value={current.model || ''} placeholder={provider?.defaultModel || ''} onChange={e => onChange(track, { model: e.target.value })} style={{ ...inputS(), flex: 1 }} />
                {loadingModels && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>...</span>}
              </div>
            )}
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleTest} disabled={testing || !hasCredential} style={{ ...btnS(false), opacity: !hasCredential ? 0.4 : 1 }}>
              {testing ? t('testing', lang) : t('connectTest', lang)}
            </button>
            <button onClick={handleClear} style={{ ...btnS(false), color: 'var(--danger)' }}>
              {t('clearConfig', lang)}
            </button>
          </div>
          {testResult && <div style={{ fontSize: 12, color: testResult.ok ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-body)' }}>{testResult.ok ? `✓ ${t('testSuccess', lang)} ${testResult.count} ${t('models', lang)}` : `✗ ${testResult.msg}`}</div>}
        </>
      )}

      {/* ── Switch Provider ── */}
      <details>
        <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', userSelect: 'none' }}>{t('switchProvider', lang)} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— {t('switchProviderHint', lang)}</span></summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['usage', 'subscription'].map(mode => {
              const active = billingView === mode
              return (
                <button key={mode} onClick={() => setBillingView(mode)} style={{ ...btnS(false), padding: '7px 10px', background: active ? 'var(--accent-soft)' : 'var(--bg-surface)', color: active ? 'var(--accent)' : 'var(--text-secondary)', borderColor: active ? 'var(--border-accent)' : 'var(--border-default)' }}>
                  {t(mode === 'usage' ? 'usageBilling' : 'subscriptionBilling', lang)} · {billingCounts[mode]}
                </button>
              )
            })}
          </div>
          <div style={{ color: billingView === 'subscription' ? 'var(--danger)' : 'var(--text-muted)', background: billingView === 'subscription' ? 'var(--danger-soft)' : 'transparent', border: billingView === 'subscription' ? '1px solid var(--danger-border)' : 'none', borderRadius: 'var(--radius-sm)', padding: billingView === 'subscription' ? '7px 9px' : 0, fontSize: 11, lineHeight: 1.5 }}>
            {t(billingView === 'subscription' ? 'subscriptionBillingDesc' : 'usageBillingDesc', lang)}
          </div>
          <ProviderWorkbench track={track} providers={visibleProviders} selectedProviderId={current.id || ''} onSelect={selectProvider} lang={lang} />
        </div>
      </details>

      {/* ── Advanced options ── */}
      {isExecutableProvider(provider) && (
        <details open={showAdvanced} onToggle={e => setShowAdvanced(e.target.open)}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', userSelect: 'none' }}>{t('advanced', lang)}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10, borderLeft: '2px solid var(--border-subtle)', marginLeft: 4, paddingLeft: 12 }}>
            {track === 'chat' && (
              <label style={labelS()}>
                {t('customSystemPrompt', lang)}
                <textarea value={current.customSystemPrompt || ''} placeholder={t('customSystemPromptPh', lang)} onChange={e => onChange(track, { customSystemPrompt: e.target.value })} style={{ ...inputS(), minHeight: 60, resize: 'vertical' }} />
              </label>
            )}
            {track === 'image' && (
              <label style={labelS()}>
                {t('defaultNegPrompt', lang)}
                <input type="text" value={current.defaultNegPrompt || ''} placeholder={t('defaultNegPromptPh', lang)} onChange={e => onChange(track, { defaultNegPrompt: e.target.value })} style={inputS()} />
              </label>
            )}
            <CustomApiFields track={track} provider={provider} current={current} onChange={onChange} lang={lang} />
          </div>
        </details>
      )}
    </div>
  )
}

/* ── Appearance page ── */
function AppearancePage({ config, onChange, lang }) {
  const g = config?.general || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelS()}>
        {t('theme', lang)}
        <select value={g.theme || 'light'} onChange={e => onChange('general', { theme: e.target.value })} style={selectS()}>
          <option value="dark">{t('dark', lang)}</option>
          <option value="light">{t('light', lang)}</option>
          <option value="system">{t('system', lang)}</option>
        </select>
      </label>
      <label style={labelS()}>
        {t('fontSize', lang)}
        <select value={g.fontSize || 'medium'} onChange={e => onChange('general', { fontSize: e.target.value })} style={selectS()}>
          <option value="small">{t('small', lang)}</option>
          <option value="medium">{t('medium', lang)}</option>
          <option value="large">{t('large', lang)}</option>
        </select>
      </label>
    </div>
  )
}

/* ── Language page ── */
function LangPage({ config, onChange, lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelS()}>
        {t('language', lang)}
        <select value={config?.general?.language || 'zh'} onChange={e => onChange('general', { language: e.target.value })} style={selectS()}>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  )
}

/* ── Other settings page ── */
function OtherPage({ config, onChange, lang }) {
  const g = config?.general || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ ...labelS(), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={g.autoSave !== false} onChange={e => onChange('general', { autoSave: e.target.checked })} />
        {t('autoSave', lang)}
      </label>
      <label style={{ ...labelS(), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={g.autoSaveImage === true} onChange={e => onChange('general', { autoSaveImage: e.target.checked })} />
        {t('autoSaveImages', lang)}
      </label>
      <label style={{ ...labelS(), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={g.enableReference === true} onChange={e => onChange('general', { enableReference: e.target.checked })} />
        <div>
          <div>{t('enableReference', lang)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t('enableReferenceDesc', lang)}</div>
        </div>
      </label>
      <label style={{ ...labelS(), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={g.enableVideo === true} onChange={e => onChange('general', { enableVideo: e.target.checked })} />
        <div>
          <div>{t('enableVideo', lang)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t('enableVideoDesc', lang)}</div>
        </div>
      </label>
      <label style={labelS()}>
        {t('apiTimeout', lang)}
        <select value={g.apiTimeout || 60000} onChange={e => onChange('general', { apiTimeout: Number(e.target.value) })} style={selectS()}>
          <option value={30000}>{t('sec30', lang)}</option>
          <option value={60000}>{t('sec60', lang)}</option>
          <option value={120000}>{t('sec120', lang)}</option>
        </select>
      </label>
    </div>
  )
}

/* ── Image settings page ── */
function ImagePage({ config, providers, onChange, lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProviderTab track="image" providers={providers} config={config} onChange={(t2, patch) => onChange('image', patch)} lang={lang} />
    </div>
  )
}

/* ── Video settings page ── */
function VideoPage({ config, providers, onChange, lang }) {
  const g = config?.general || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProviderTab track="video" providers={providers} config={config} onChange={(t2, patch) => onChange('video', patch)} lang={lang} />
      <label style={labelS()}>
        {t('defaultDuration', lang)}
        <select value={g.defaultDuration || '5s'} onChange={e => onChange('general', { defaultDuration: e.target.value })} style={selectS()}>
          {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
    </div>
  )
}

/* ── Main Settings ── */
function normalizeSettingsPage(page, videoEnabled) {
  if (page === 'api' || page === 'chat') return 'api-chat'
  if (page === 'image') return 'api-image'
  if (page === 'video') return videoEnabled ? 'api-video' : 'api-image'
  if (page === 'api-video' && !videoEnabled) return 'api-image'
  return page || 'appearance'
}

export default function Settings({ config, providerLists, onSave, onClose, initialPage = 'appearance' }) {
  const [page, setPage] = useState(() => normalizeSettingsPage(initialPage, config?.general?.enableVideo === true))
  const [local, setLocal] = useState(config)
  const [expanded, setExpanded] = useState({ general: true, api: true })
  useEffect(() => { if (config) setLocal(config) }, [config])
  useEffect(() => {
    if (initialPage) setPage(normalizeSettingsPage(initialPage, local?.general?.enableVideo === true))
  }, [initialPage])
  useEffect(() => {
    const nextPage = normalizeSettingsPage(page, local?.general?.enableVideo === true)
    if (nextPage !== page) setPage(nextPage)
  }, [page, local?.general?.enableVideo])

  // Escape key to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const lang = local?.general?.language || 'zh'
  const providers = {
    chat: providerLists?.chat?.length ? providerLists.chat : CHAT_PROVIDERS,
    image: providerLists?.image?.length ? providerLists.image : IMG_PROVIDERS,
    video: providerLists?.video?.length ? providerLists.video : VID_PROVIDERS
  }

  const handleChange = (track, patch) => {
    if (!local) return
    if (track === 'general') setLocal(prev => ({ ...prev, general: { ...prev.general, ...patch } }))
    else if (track === 'providerProfiles') setLocal(prev => ({ ...prev, providerProfiles: { ...prev.providerProfiles, ...patch } }))
    else if (track === '_deletedProfileKeys') setLocal(prev => ({ ...prev, _deletedProfileKeys: patch }))
    else setLocal(prev => ({ ...prev, providers: { ...prev.providers, [track]: { ...prev.providers[track], ...patch } } }))
  }

  const handleSave = () => { if (local) { onSave(local); onClose() } }

  if (!local) return null
  const videoApiEnabled = local?.general?.enableVideo === true

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-dark)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 860, maxWidth: '92vw', maxHeight: '84vh', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', fontFamily: 'var(--font-body)', animation: 'scaleIn 0.2s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings', lang)}</span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
          ><Ic n="close" size={16} sw={2} /></button>
        </div>
        {/* Body: sidebar + content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 170, borderRight: '1px solid var(--border-subtle)', padding: '12px 0', overflow: 'auto', flexShrink: 0 }}>
            {NAV_SECTIONS.map(section => (
              <div key={section.id}>
                <button onClick={() => setExpanded(prev => ({ ...prev, [section.id]: !prev[section.id] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                  <Ic n={section.icon} size={13} sw={2} />
                  {t(section.labelKey, lang)}
                  <span style={{ marginLeft: 'auto', fontSize: 10, transition: 'transform 0.15s', transform: expanded[section.id] ? 'rotate(0)' : 'rotate(-90deg)' }}>▼</span>
                </button>
                {expanded[section.id] && section.children.filter(child => !child.requiresVideo || videoApiEnabled).map(child => (
                  <button key={child.id} onClick={() => setPage(child.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 16px 7px 36px', background: page === child.id ? 'var(--accent-soft)' : 'transparent', border: 'none', borderRight: page === child.id ? '2px solid var(--accent)' : '2px solid transparent', color: page === child.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 'var(--font-size-base)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: page === child.id ? 500 : 400 }}
                    onMouseEnter={e => { if (page !== child.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (page !== child.id) e.currentTarget.style.background = 'transparent' }}
                  >{t(child.labelKey, lang)}</button>
                ))}
              </div>
            ))}
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {page === 'appearance' && <AppearancePage config={local} onChange={handleChange} lang={lang} />}
            {page === 'lang' && <LangPage config={local} onChange={handleChange} lang={lang} />}
            {page === 'other' && <OtherPage config={local} onChange={handleChange} lang={lang} />}
            {page === 'api-chat' && <ProviderTab track="chat" providers={providers.chat} config={local} onChange={handleChange} lang={lang} />}
            {page === 'api-image' && <ImagePage config={local} providers={providers.image} onChange={handleChange} lang={lang} />}
            {page === 'api-video' && videoApiEnabled && <VideoPage config={local} providers={providers.video} onChange={handleChange} lang={lang} />}
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnS(false)}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-accent)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          >{t('cancel', lang)}</button>
          <button onClick={handleSave} style={btnS(true)}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = btnS(true).boxShadow }}
          >{t('save', lang)}</button>
        </div>
      </div>
    </div>
  )
}
