import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { createProviderClearPatch, createProviderProfilePatch, createProviderSelectionPatch, firstProviderModel, providerNeedsTemplatePaths, providerTemplatePathStatus, providerTemplatePresets } from '../utils/providerConfig.js'
import {
  canonicalProviderKey,
  currentMatchesProvider,
  isModelEndpointUnsupportedError,
  isProviderNetworkError,
  profileKey,
  profileMatchesProvider,
  providerAuthConfig,
  providerCredentialReady,
  providerRequiresCredential,
  providerUsesSession
} from '../utils/settingsProviderHelpers.js'
import { t } from '../i18n'
import Ic from './icons'
import useSafeMediaUrl from '../hooks/useSafeMediaUrl'
import { OPENAI_COMPATIBLE_GATEWAY_PRESETS, normalizeProviderAccount, providerGatewayPresetPatch, providerPatchFromAccount, findProviderAccount } from '../utils/providerAccounts.js'
import modelCapabilities from '../../shared/modelCapabilities.cjs'

const { normalizeModelRecord, sortModelRecords } = modelCapabilities

const NAV_SECTIONS = [
  { id: 'api', labelKey: 'apiConfig', icon: 'link', children: [
    { id: 'provider-accounts', labelKey: 'providerAccounts' },
    { id: 'provider-api-keys', labelKey: 'providerApiKeys' },
    { id: 'provider-gateways', labelKey: 'providerGateways' },
    { id: 'model-pairing', labelKey: 'modelPairing' },
  ]},
  { id: 'general', labelKey: 'general', icon: 'gear', children: [
    { id: 'appearance', labelKey: 'appearance' },
    { id: 'lang', labelKey: 'language' },
    { id: 'other', labelKey: 'other' },
  ]},
]

function SafeImagePreview({ url }) {
  const { src } = useSafeMediaUrl(url, 'image')
  if (!src) return null
  return <img src={src} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }} />
}

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
  'custom-image',
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
    'custom-image',
    'custom-image-gemini',
    'custom-image-ark',
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
    'custom-video',
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
const API_KEY_PROVIDER_IDS = ['openai', 'openrouter', 'anthropic', 'xai', 'deepseek', 'minimax', 'siliconflow', 'google', 'volcengine', 'alibaba', 'moonshot']
const OAUTH_PLACEHOLDER_ACCOUNTS = [
  { providerId: 'chatgpt-plans', name: 'OpenAI OAuth (ChatGPT)', descriptionKey: 'oauthPlaceholderOpenAi' },
  { providerId: 'minimax', name: 'MiniMax', descriptionKey: 'oauthPlaceholderBrowser' },
  { providerId: 'xai', name: 'xAI Grok', descriptionKey: 'oauthPlaceholderBrowser' }
]

function providerErrorMessage(error, lang) {
  if (isProviderNetworkError(error)) return t('networkEndpointUnreachable', lang)
  return error?.message || ''
}

function allProvidersById(providers = {}) {
  const map = new Map()
  for (const track of TRACKS) {
    for (const provider of providers?.[track] || []) {
      if (!map.has(provider.id)) map.set(provider.id, provider)
    }
  }
  return map
}

function providerDefById(providers = {}, providerId) {
  return allProvidersById(providers).get(providerId) || {}
}

function providerDefForTrack(providers = {}, track, providerId) {
  return (providers?.[track] || []).find(provider => provider.id === providerId) || {}
}

function providerAccountLabel(account = {}, providers = {}, lang = 'zh') {
  const provider = providerDefById(providers, account.providerId)
  const base = account.name || providerDisplayName(provider, lang) || account.providerId || t('providerAccount', lang)
  const suffix = account.kind === 'gateway' ? t('providerGateway', lang) : account.kind === 'oauth-placeholder' ? t('providerAccount', lang) : t('providerApiKey', lang)
  return `${base} · ${suffix}`
}

function accountAvailableForTrack(account = {}, track, providers = {}) {
  if (account.kind === 'oauth-placeholder') return false
  if (Array.isArray(account.tracks) && account.tracks.length > 0 && !account.tracks.includes(track)) return false
  return Boolean((providers?.[track] || []).some(provider => provider.id === account.providerId))
}

function modelForProviderSwitch(currentModel, provider = {}) {
  const catalog = Array.isArray(provider.modelCatalog) ? provider.modelCatalog : []
  if (currentModel && catalog.includes(currentModel)) return currentModel
  if (currentModel && catalog.length === 0 && provider.defaultModel === currentModel) return currentModel
  return firstProviderModel(provider)
}

function configuredAccount(account = {}) {
  return Boolean(account.apiKey || account.sessionToken || account.kind === 'oauth-placeholder')
}

function modelFetchFailureMessage(error, lang) {
  const detail = providerErrorMessage(error, lang)
  return detail ? `${t('modelFetchFailed', lang)}: ${detail}` : t('modelFetchFailed', lang)
}

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
  const capabilities = provider.capabilities?.[track] || provider.meta?.capabilities?.[track] || trackMeta.capabilities?.[track] || provider.capabilities || {}
  const customizable = provider.customizable?.[track] || provider.meta?.customizable?.[track] || trackMeta.customizable?.[track] || provider.customizable || {}
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

function providerPoolForTrack(providers) {
  return providers
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
      const aConfigured = currentMatchesProvider(track, current, a.provider) && providerCredentialReady(a.provider, current)
      const bConfigured = currentMatchesProvider(track, current, b.provider) && providerCredentialReady(b.provider, current)
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

function modelCapabilityLabel(capability, lang) {
  if (capability === 'image') return t('modelCapabilityImage', lang)
  if (capability === 'chat') return t('modelCapabilityChat', lang)
  if (capability === 'other') return t('modelCapabilityOther', lang)
  return t('modelCapabilityUnknown', lang)
}

function callModeLabel(mode, lang) {
  if (mode === 'direct-api') return t('callModeDirectApi', lang)
  if (mode === 'custom-api') return t('callModeCustomApi', lang)
  if (mode === 'subscription-reference') return t('callModeSubscriptionReference', lang)
  return t('callModeReference', lang)
}

function setupModeLabel(mode, lang) {
  if (mode === 'api-key') return t('setupModeApiKey', lang)
  if (mode === 'api-key-or-session') return t('setupModeApiKeyOrSession', lang)
  if (mode === 'custom-api') return t('setupModeCustomApi', lang)
  if (mode === 'subscription-reference') return t('setupModeSubscriptionReference', lang)
  if (mode === 'no-auth') return t('setupModeNoAuth', lang)
  return t('setupModeReference', lang)
}

function callModeDescription(provider = {}, lang) {
  if (provider.callMode === 'direct-api') return t('callModeDirectApiDesc', lang)
  if (provider.callMode === 'custom-api') return t('callModeCustomApiDesc', lang)
  if (provider.callMode === 'subscription-reference') return t('callModeSubscriptionReferenceDesc', lang)
  return t('callModeReferenceDesc', lang)
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

function authDescription(provider = {}, current = {}, lang) {
  const auth = providerAuthConfig(provider, current)
  const name = auth.sessionHeaderName || auth.headerName || auth.paramName || auth.key || ''
  if (auth.type === 'none') return t('authProviderNone', lang)
  if (auth.type === 'session') return t('authProviderSession', lang).replace('{name}', name || 'X-Session-Token')
  if (auth.type === 'query') return t('authProviderQuery', lang).replace('{name}', name || 'key')
  if (auth.type === 'header' || auth.type === 'api-key' || auth.type === 'apikey') return t('authProviderHeader', lang).replace('{name}', name || 'x-api-key')
  return t('authProviderBearer', lang)
}

function profileDisplayName(track, profile = {}, providers = [], lang) {
  const provider = providers.find(item => profileMatchesProvider(track, profile, item))
  const name = provider ? providerDisplayName(provider, lang, track) : profile.name || profile.providerId || profile.id || ''
  return [name, profile.model].filter(Boolean).join(' · ')
}

function ModelPairingPage({ config, providers, onChange, lang }) {
  const tracks = [
    { id: 'chat', icon: 'messageCircle', labelKey: 'chatModel' },
    { id: 'image', icon: 'image', labelKey: 'imageModel' },
    { id: 'video', icon: 'video', labelKey: 'videoModel' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t('modelPairing', lang)}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('modelPairingDesc', lang)}</div>
      </div>
      {tracks.map(track => {
        const trackProviders = (providers[track.id] || []).filter(p => isExecutableProvider(p))
        const current = config?.providers?.[track.id] || {}
        const selectedProviderId = current.id || current.providerId || ''
        const selectedProvider = trackProviders.find(p => p.id === selectedProviderId)
        const currentModel = current.model || ''
        const profiles = (config?.providerProfiles?.[track.id] || []).filter(p => {
          const def = trackProviders.find(d => d.id === (p.providerId || p.id))
          return isExecutableProvider(def) && (p.apiKey || p.accountId || def?.authType?.type === 'none')
        })

        return (
          <div key={track.id} style={{
            border: `1px solid var(--border-subtle)`,
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            background: 'var(--bg-elevated)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ic n={track.icon} size={14} />
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{t(track.labelKey, lang)}</span>
              {selectedProvider && currentModel ? (
                <span style={{ fontSize: 10, color: 'var(--success)', background: 'var(--success-soft)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>{t('paired', lang)}</span>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>{t('unpaired', lang)}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <label style={{ ...labelS(), flex: 1 }}>
                {t('provider', lang)}
                <select
                  value={selectedProviderId}
                  onChange={e => {
                    const newId = e.target.value
                    if (!newId) return
                    onChange(track.id, { id: newId, model: '' })
                  }}
                  style={selectS()}
                >
                  <option value="">{t('selectProvider', lang)}</option>
                  {trackProviders.map(p => (
                    <option key={p.id} value={p.id}>{providerDisplayName(p, lang, track.id)}</option>
                  ))}
                </select>
              </label>
              <label style={{ ...labelS(), flex: 1 }}>
                {t('model', lang)}
                <input
                  type="text"
                  value={currentModel}
                  onChange={e => onChange(track.id, { model: e.target.value })}
                  placeholder={t('modelPlaceholder', lang)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-accent)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                />
              </label>
            </div>
            {profiles.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {profiles.slice(0, 5).map(p => {
                  const pid = p.providerId || p.id
                  const isActive = pid === selectedProviderId && p.model === currentModel
                  return (
                    <button
                      key={p.profileId || `${pid}:${p.model}`}
                      onClick={() => onChange(track.id, { id: pid, model: p.model })}
                      style={{
                        ...btnS(isActive),
                        padding: '3px 8px',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                        borderColor: isActive ? 'var(--border-accent)' : 'var(--border-subtle)',
                      }}
                    >
                      {p.model}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CustomApiFields({ track, provider, current, onChange, lang, showAuthMode = true }) {
  const info = providerInfo(provider, track)
  const isCustom = provider?.platform === 'Custom' || provider?.id?.startsWith('custom-')
  const usesTemplateSetup = provider?.setupMode === 'custom-api' || provider?.callMode === 'custom-api' || provider?.integrationStatus === 'custom-template'
  if (!isCustom && !usesTemplateSetup && !info.capabilities?.customTemplate && !info.capabilities?.customBaseUrl) return null

  const customAuth = current.customAuth || {}
  const template = current.template || current.customTemplate || {}
  const templatePresets = providerTemplatePresets(track, provider)
  const patchAuth = (patch) => onChange(track, { customAuth: { ...customAuth, ...patch } })
  const patchTemplate = (patch) => onChange(track, { template: { ...template, ...patch } })
  const applyTemplatePreset = (preset) => {
    onChange(track, { template: { ...template, ...preset.template } })
  }
  const templateText = (value) => {
    if (value == null || value === '') return ''
    if (typeof value === 'string') return value
    try { return JSON.stringify(value, null, 2) } catch { return '' }
  }
  const bodyAliasPatch = (key, value) => {
    if (key === 'requestBody') return { requestBody: value, body: '', submitBody: '' }
    if (key === 'submitBody') return { submitBody: value, body: '', requestBody: '' }
    return { [key]: value }
  }
  const patchJsonTemplate = (key, value) => {
    const text = String(value || '').trim()
    if (!text) {
      patchTemplate(bodyAliasPatch(key, ''))
      return
    }
    try {
      patchTemplate(bodyAliasPatch(key, JSON.parse(text)))
    } catch {
      patchTemplate(bodyAliasPatch(key, value))
    }
  }
  const methodSelect = (value, onSelect) => (
    <select value={value || ''} onChange={e => onSelect(e.target.value)} style={selectS()}>
      <option value="">{t('defaultValue', lang)}</option>
      <option value="GET">GET</option>
      <option value="POST">POST</option>
      <option value="PUT">PUT</option>
      <option value="PATCH">PATCH</option>
    </select>
  )
  const patchRequestMethod = (value) => patchTemplate({ method: value, submitMethod: '' })
  const patchSubmitMethod = (value) => patchTemplate({ submitMethod: value, method: '' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {templatePresets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('templatePresets', lang)}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {templatePresets.map(preset => (
              <button key={preset.id} onClick={() => applyTemplatePreset(preset)} style={{ ...btnS(false), padding: '6px 9px', fontSize: 11 }}>
                {t(preset.labelKey, lang)}
              </button>
            ))}
          </div>
        </div>
      )}
      {showAuthMode && (
        <label style={labelS()}>
          {t('authMode', lang)}
          <select value={customAuth.type || ''} onChange={e => patchAuth(e.target.value ? { type: e.target.value } : { type: '' })} style={selectS()}>
            <option value="">{t('authBearer', lang)}</option>
            <option value="bearer">{t('authBearer', lang)}</option>
            <option value="api-key">{t('authApiKey', lang)}</option>
            <option value="header">{t('authHeader', lang)}</option>
            <option value="query">{t('authQuery', lang)}</option>
            <option value="session">{t('authSession', lang)}</option>
            <option value="none">{t('authNone', lang)}</option>
          </select>
        </label>
      )}
      {(customAuth.type === 'api-key' || customAuth.type === 'header') && (
        <label style={labelS()}>
          {t('headerName', lang)}
          <input type="text" value={customAuth.headerName || customAuth.key || ''} placeholder="x-api-key" onChange={e => patchAuth({ headerName: e.target.value })} style={inputS()} />
        </label>
      )}
      {customAuth.type === 'query' && (
        <label style={labelS()}>
          {t('queryName', lang)}
          <input type="text" value={customAuth.paramName || customAuth.key || ''} placeholder="key" onChange={e => patchAuth({ paramName: e.target.value })} style={inputS()} />
        </label>
      )}
      {customAuth.type === 'session' && (
        <label style={labelS()}>
          {t('sessionHeaderName', lang)}
          <input type="text" value={customAuth.sessionHeaderName || customAuth.headerName || customAuth.key || ''} placeholder="X-Session-Token" onChange={e => patchAuth({ sessionHeaderName: e.target.value })} style={inputS()} />
        </label>
      )}
      {track === 'image' && (
        <>
          <label style={labelS()}>
            {t('requestMethod', lang)}
            {methodSelect(template.method || template.submitMethod, patchRequestMethod)}
          </label>
          <label style={labelS()}>
            {t('imageSubmitPath', lang)}
            <input type="text" value={template.path || template.submitPath || ''} placeholder="/v1/images/generations" onChange={e => patchTemplate({ path: e.target.value })} style={inputS()} />
          </label>
          <label style={labelS()}>
            {t('requestBody', lang)}
            <textarea value={templateText(template.requestBody || template.body || template.submitBody)} placeholder='{"model":"{model}","prompt":"{prompt}"}' onChange={e => patchJsonTemplate('requestBody', e.target.value)} style={{ ...inputS(), minHeight: 92, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          </label>
          <label style={labelS()}>
            {t('imageResponsePath', lang)}
            <input type="text" value={template.imageUrlPath || template.responsePath || ''} placeholder="data[0].b64_json / data[0].url" onChange={e => patchTemplate({ imageUrlPath: e.target.value })} style={inputS()} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelS()}>
              {t('taskIdPath', lang)}
              <input type="text" value={template.taskIdPath || ''} placeholder="data.task_id" onChange={e => patchTemplate({ taskIdPath: e.target.value })} style={inputS()} />
            </label>
            <label style={labelS()}>
              {t('statusPath', lang)}
              <input type="text" value={template.statusPath || ''} placeholder="data.status" onChange={e => patchTemplate({ statusPath: e.target.value })} style={inputS()} />
            </label>
          </div>
          <label style={labelS()}>
            {t('pollPath', lang)}
            <input type="text" value={template.pollPath || ''} placeholder="/v1/images/tasks/{taskId}" onChange={e => patchTemplate({ pollPath: e.target.value })} style={inputS()} />
          </label>
          <label style={labelS()}>
            {t('pollMethod', lang)}
            {methodSelect(template.pollMethod, value => patchTemplate({ pollMethod: value }))}
          </label>
        </>
      )}
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
            {t('submitMethod', lang)}
            {methodSelect(template.submitMethod || template.method, patchSubmitMethod)}
          </label>
          <label style={labelS()}>
            {t('submitBody', lang)}
            <textarea value={templateText(template.submitBody || template.body || template.requestBody)} placeholder='{"model":"{model}","prompt":"{prompt}","image_url":"{sourceImageUrl}"}' onChange={e => patchJsonTemplate('submitBody', e.target.value)} style={{ ...inputS(), minHeight: 92, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          </label>
          <label style={labelS()}>
            {t('pollPath', lang)}
            <input type="text" value={template.pollPath || ''} placeholder="/v1/videos/{taskId}" onChange={e => patchTemplate({ pollPath: e.target.value })} style={inputS()} />
          </label>
          <label style={labelS()}>
            {t('pollMethod', lang)}
            {methodSelect(template.pollMethod, value => patchTemplate({ pollMethod: value }))}
          </label>
          <label style={labelS()}>
            {t('pollBody', lang)}
            <textarea value={templateText(template.pollBody)} placeholder='{"task_id":"{taskId}"}' onChange={e => patchJsonTemplate('pollBody', e.target.value)} style={{ ...inputS(), minHeight: 78, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
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
  const configured = providerCredentialReady(provider, current)
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
        <span style={chipS(provider?.executable === false || provider?.integrationStatus === 'metadata' ? 'var(--text-muted)' : 'var(--success)')}>{callModeLabel(provider?.callMode, lang)}</span>
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
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
        {callModeDescription(provider, lang)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={chipS('var(--text-muted)')}>{callModeLabel(provider.callMode, lang)}</span>
        <span style={chipS('var(--text-muted)')}>{setupModeLabel(provider.setupMode, lang)}</span>
      </div>
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

function CurrentProviderLinks({ provider, track, lang }) {
  const info = providerInfo(provider, track)
  const priorityKeys = ['apiKey', 'console', 'purchase', 'docs']
  const links = priorityKeys
    .map(key => LINK_BUTTONS.find(button => button.key === key))
    .filter(button => button && info.links?.[button.key])
  if (links.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {links.map(button => (
        <button key={button.key} onClick={() => openExternal(info.links[button.key])}
          style={{ ...btnS(false), padding: '6px 9px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Ic n={button.icon} size={11} />{t(button.labelKey, lang)}
        </button>
      ))}
    </div>
  )
}

function ReadinessItem({ ready, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, minWidth: 0 }}>
      <span style={{
        width: 16, height: 16, flex: '0 0 16px', borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: ready ? 'var(--success-soft)' : 'var(--bg-surface)',
        color: ready ? 'var(--success)' : 'var(--text-muted)',
        border: `1px solid ${ready ? 'var(--success-soft)' : 'var(--border-subtle)'}`,
        fontSize: 10, lineHeight: 1
      }}>{ready ? '✓' : '!'}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>{label}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>
      </div>
    </div>
  )
}

function ProviderReadiness({ items, onApplyRecommended, canApplyRecommended, lang }) {
  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)',
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>{t('setupChecklist', lang)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{t('setupChecklistHint', lang)}</div>
        </div>
        {canApplyRecommended && (
          <button onClick={onApplyRecommended} style={{ ...btnS(false), padding: '6px 9px', fontSize: 11 }}>
            {t('applyRecommendedConfig', lang)}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 9 }}>
        {items.map(item => <ReadinessItem key={item.key} ready={item.ready} label={item.label} detail={item.detail} />)}
      </div>
    </div>
  )
}

function ProviderTab({ track, providers, allProviders, config, onChange, lang }) {
  const current = config?.providers?.[track] || {}
  const providerMap = allProviders || { [track]: providers }
  const providerAccounts = (config?.providerAccounts || []).filter(account => accountAvailableForTrack(account, track, providerMap))
  const allVisibleProviders = sortProvidersForTrack(providerPoolForTrack(providers), track, current)
  const savedProfiles = (config?.providerProfiles?.[track] || [])
    .filter(profile => {
      const profileProvider = providers.find(item => profileMatchesProvider(track, profile, item))
      return isExecutableProvider(profileProvider) && providerCredentialReady(profileProvider, profile) && profile.model
    })
    .filter(profile => allVisibleProviders.some(provider => profileMatchesProvider(track, profile, provider)))
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
  const providerSelectOptions = allVisibleProviders.filter(isExecutableProvider)
  const visibleProviders = allVisibleProviders.filter(p => billingGroup(p, track) === billingView)
  const selectableProviders = visibleProviders.filter(isExecutableProvider)
  const selectable = selectableProviders.length ? selectableProviders : visibleProviders
  const selectedProviderId = resolveProviderId(track, current.id, selectable)
  const provider = visibleProviders.find(p => p.id === selectedProviderId) || selectable[0] || allVisibleProviders[0]
  const currentAccount = findProviderAccount(config, current.accountId)
  const info = providerInfo(provider, track)
  const authOptions = Array.isArray(info.customizable?.auth) ? info.customizable.auth : []
  const showMainAuthMode = provider?.platform === 'Custom' || authOptions.length > 1 || Boolean(current.customAuth?.type)
  const apiKeyRedacted = current.apiKey === REDACTED_API_KEY
  const apiKeyValue = apiKeyRedacted ? '' : current.apiKey || ''
  const usesSessionAuth = providerUsesSession(provider, current)
  const sessionTokenRedacted = current.sessionToken === REDACTED_API_KEY
  const sessionTokenValue = sessionTokenRedacted ? '' : current.sessionToken || ''
  const currentProviderId = current.id || ''
  const currentApiKey = current.apiKey || ''
  const currentSessionToken = current.sessionToken || ''
  const currentModel = current.model || ''
  const currentCustomAuth = current.customAuth || {}
  const currentAuthType = current.authType || provider?.authType || {}
  const currentCustomAuthSignature = JSON.stringify(currentCustomAuth)
  const currentAuthTypeSignature = JSON.stringify(currentAuthType)
  const credentialRequired = providerRequiresCredential(provider, current)
  const credentialReady = providerCredentialReady(provider, current)
  const authHint = authDescription(provider, current, lang)
  const credentialLabel = t('credential', lang)
  const [testing, setTesting] = useState(false)
  const [imageTesting, setImageTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [models, setModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelFetchResult, setModelFetchResult] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [showAllModels, setShowAllModels] = useState(false)
  const fetchTimeout = useRef(null)
  const modelFetchSeq = useRef(0)
  const isCustomImageRelay = track === 'image' && provider?.id === 'custom-image'
  const showMainBaseUrl = true
  const modelRecords = useMemo(() => {
    const byId = new Map()
    const add = (item, source) => {
      const record = normalizeModelRecord(typeof item === 'string' ? { id: item } : item, { source })
      if (!record?.id) return
      const existing = byId.get(record.id)
      if (!existing || existing.capability === 'unknown') byId.set(record.id, record)
    }
    add(current.model, 'manual')
    add(provider?.defaultModel, 'catalog')
    for (const item of Array.isArray(provider?.modelCatalog) ? provider.modelCatalog : []) add(item, 'catalog')
    if (isCustomImageRelay) add('gpt-image-2', 'catalog')
    for (const item of Array.isArray(models) ? models : []) add(item, item?.source || 'remote')
    return Array.from(byId.values()).sort(sortModelRecords(track))
  }, [current.model, provider?.defaultModel, provider?.modelCatalog, isCustomImageRelay, models, track])
  const visibleModelRecords = useMemo(() => {
    const query = modelSearch.trim().toLowerCase()
    const filtered = modelRecords.filter(record => {
      if (track === 'image' && !showAllModels && !['image', 'unknown'].includes(record.capability)) return false
      if (track === 'chat' && !showAllModels && !['chat', 'unknown'].includes(record.capability)) return false
      return !query || record.id.toLowerCase().includes(query)
    })
    return filtered
  }, [modelRecords, modelSearch, showAllModels, track])
  const modelOptions = visibleModelRecords.map(record => record.id)
  const recommendedModel = firstProviderModel(provider) || current.model || ''
  const effectiveBaseUrl = current.baseUrl || provider?.defaultUrl || ''
  const effectivePathPrefix = current.pathPrefix || provider?.pathPrefix || ''
  const effectiveModelListPath = current.modelListPath || provider?.modelListPath || provider?.modelsPath || ''
  const endpointReady = Boolean(effectiveBaseUrl)
  const modelReady = Boolean(current.model || recommendedModel)
  const templatePathsRequired = providerNeedsTemplatePaths(track, provider)
  const templatePathStatus = providerTemplatePathStatus(track, current)
  const canApplyRecommended = Boolean((provider?.defaultUrl && current.baseUrl !== provider.defaultUrl) || (recommendedModel && current.model !== recommendedModel))
  const readinessItems = [
    {
      key: 'credential',
      ready: credentialReady,
      label: t('setupCredential', lang),
      detail: credentialRequired ? authHint : t('authProviderNone', lang)
    },
    {
      key: 'endpoint',
      ready: endpointReady,
      label: t('setupEndpoint', lang),
      detail: effectiveBaseUrl || t('missingBaseUrl', lang)
    },
    {
      key: 'model',
      ready: modelReady,
      label: t('setupModel', lang),
      detail: current.model || recommendedModel || t('missingModel', lang)
    }
  ].concat(templatePathsRequired ? [{
    key: 'templatePaths',
    ready: templatePathStatus.ready,
    label: t('setupTemplatePaths', lang),
    detail: templatePathStatus.detail || t(track === 'image' ? 'missingImagePath' : 'missingVideoPaths', lang)
  }] : [])

  useEffect(() => {
    if (templatePathsRequired && !templatePathStatus.ready) setShowAdvanced(true)
  }, [currentProviderId, templatePathsRequired, templatePathStatus.ready])

  const fetchModelList = useCallback(async () => {
    const requestId = ++modelFetchSeq.current
    if (!credentialReady || !effectiveBaseUrl) { setModels([]); setModelFetchResult(null); return }
    setLoadingModels(true)
    setModelFetchResult(null)
    try {
      const list = await window.electronAPI.fetchModels({
        apiKey: currentApiKey,
        sessionToken: currentSessionToken,
        customAuth: currentCustomAuth,
        baseUrl: effectiveBaseUrl,
        accountId: current.accountId,
        accountKind: current.accountKind,
        id: selectedProviderId,
        track,
        format: provider?.format,
        protocol: provider?.protocol,
        authType: currentAuthType,
        pathPrefix: effectivePathPrefix,
        modelListPath: effectiveModelListPath,
        model: currentModel || recommendedModel,
        reportErrors: true
      })
      if (requestId !== modelFetchSeq.current) return
      const nextModels = Array.isArray(list) ? list : []
      setModels(nextModels)
      setModelFetchResult({
        ok: nextModels.length > 0,
        warning: nextModels.length === 0,
        msg: nextModels.length > 0 ? `${t('modelFetchSuccess', lang)} ${nextModels.length}` : t('modelListEmpty', lang)
      })
      if (nextModels.length > 0 && !currentModel) {
        onChange(track, { model: nextModels[0].id })
      }
    } catch (error) {
      if (requestId !== modelFetchSeq.current) return
      setModels([])
      if (isModelEndpointUnsupportedError(error) && modelOptions.length > 0) {
        if (!currentModel && recommendedModel) onChange(track, { model: recommendedModel })
        setModelFetchResult({ ok: false, warning: true, msg: t('modelFetchUnsupported', lang) })
        return
      }
      setModelFetchResult({ ok: false, msg: modelFetchFailureMessage(error, lang) })
    } finally {
      if (requestId === modelFetchSeq.current) setLoadingModels(false)
    }
  }, [currentApiKey, currentSessionToken, currentCustomAuth, currentAuthType, currentModel, currentProviderId, effectivePathPrefix, effectiveModelListPath, credentialReady, effectiveBaseUrl, modelOptions, recommendedModel, provider?.defaultModel, provider?.format, provider?.protocol, selectedProviderId, onChange, track, lang])

  useEffect(() => {
    clearTimeout(fetchTimeout.current)
    if (credentialReady && effectiveBaseUrl) {
      fetchTimeout.current = setTimeout(fetchModelList, 600)
    } else {
      modelFetchSeq.current += 1
      setLoadingModels(false)
      setModels([])
      setModelFetchResult(null)
    }
    return () => clearTimeout(fetchTimeout.current)
  }, [currentProviderId, currentApiKey, currentSessionToken, currentCustomAuthSignature, currentAuthTypeSignature, effectivePathPrefix, effectiveModelListPath, selectedProviderId, effectiveBaseUrl, credentialReady])

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const params = {
        ...current,
        baseUrl: effectiveBaseUrl,
        accountId: current.accountId,
        accountKind: current.accountKind,
        id: selectedProviderId,
        providerId: selectedProviderId,
        track,
        format: provider?.format,
        protocol: provider?.protocol,
        authType: currentAuthType,
        customAuth: currentCustomAuth,
        pathPrefix: effectivePathPrefix,
        modelListPath: effectiveModelListPath,
        model: current.model || recommendedModel,
        reportErrors: true
      }
      const test = await window.electronAPI.providerAPI?.test?.(params)
      if (test && test.ok === false) {
        setTestResult({ ok: false, msg: providerErrorMessage(test.message, lang) || t('testFail', lang) })
        return
      }
      modelFetchSeq.current += 1
      const list = await window.electronAPI.fetchModels(params)
      const nextModels = Array.isArray(list) ? list : []
      setModels(nextModels)
      setModelFetchResult({
        ok: nextModels.length > 0,
        warning: nextModels.length === 0,
        msg: nextModels.length > 0 ? `${t('modelFetchSuccess', lang)} ${nextModels.length}` : t('modelListEmpty', lang)
      })
      setTestResult({
        ok: true,
        warning: nextModels.length === 0,
        msg: nextModels.length > 0 ? `${t('testSuccess', lang)} ${nextModels.length} ${t('models', lang)}` : t('modelListEmpty', lang)
      })
    } catch (e) {
      const fallbackAvailable = isModelEndpointUnsupportedError(e) && modelOptions.length > 0
      const msg = fallbackAvailable
        ? t('modelFetchUnsupported', lang)
        : modelFetchFailureMessage(e, lang)
      if (fallbackAvailable && !currentModel && recommendedModel) onChange(track, { model: recommendedModel })
      setModels([])
      setModelFetchResult({ ok: false, warning: fallbackAvailable, msg })
      setTestResult({ ok: fallbackAvailable, warning: fallbackAvailable, msg })
    }
    finally { setTesting(false) }
  }

  const handleImageTest = async () => {
    setImageTesting(true); setTestResult(null)
    try {
      const params = {
        ...current,
        baseUrl: effectiveBaseUrl,
        accountId: current.accountId,
        accountKind: current.accountKind,
        id: selectedProviderId,
        providerId: selectedProviderId,
        track,
        testMode: 'image',
        format: provider?.format,
        protocol: provider?.protocol,
        authType: currentAuthType,
        customAuth: currentCustomAuth,
        pathPrefix: effectivePathPrefix,
        modelListPath: effectiveModelListPath,
        model: current.model || recommendedModel,
        prompt: 'A simple red square icon on a clean white background.',
        ratio: '1:1',
        resolution: '1024'
      }
      const test = await window.electronAPI.providerAPI?.test?.(params)
      if (!test || test.ok === false) {
        setTestResult({ ok: false, msg: test?.message || t('testFail', lang) })
        return
      }
      setTestResult({ ok: true, msg: t('imageTestSuccess', lang), imageUrl: test.imageUrl })
    } catch (e) { setTestResult({ ok: false, msg: e.message }) }
    finally { setImageTesting(false) }
  }

  const handleClear = () => {
    if (window.confirm(t('clearConfirm', lang))) {
      onChange(track, createProviderClearPatch())
      modelFetchSeq.current += 1
      setModels([])
      setTestResult(null)
      setModelFetchResult(null)
    }
  }

  const handleRestoreUrl = () => {
    if (provider?.defaultUrl) onChange(track, { baseUrl: provider.defaultUrl })
  }

  const handleApplyRecommended = () => {
    const patch = {}
    if (provider?.defaultUrl) patch.baseUrl = provider.defaultUrl
    if (recommendedModel) patch.model = recommendedModel
    if (Object.keys(patch).length > 0) onChange(track, patch)
  }

  const selectProvider = (p) => {
    onChange(track, createProviderSelectionPatch(p, track))
    modelFetchSeq.current += 1
    setModels([])
    setTestResult(null)
    setModelFetchResult(null)
  }

  const selectProfile = (profile) => {
    const providerForProfile = allVisibleProviders.find(item => profileMatchesProvider(track, profile, item))
    if (providerForProfile) setBillingView(billingGroup(providerForProfile, track))
    onChange(track, createProviderProfilePatch(profile))
    modelFetchSeq.current += 1
    setModels([])
    setTestResult(null)
    setModelFetchResult(null)
  }

  const selectAccount = (accountId) => {
    if (!accountId) {
      onChange(track, { accountId: '', accountKind: '' })
      return
    }
    const account = findProviderAccount(config, accountId)
    if (!account) return
    const providerForAccount = allVisibleProviders.find(item => item.id === account.providerId)
    if (providerForAccount) setBillingView(billingGroup(providerForAccount, track))
    const targetProvider = providerForAccount || providerDefForTrack(providerMap, track, account.providerId)
    onChange(track, {
      ...providerPatchFromAccount(account, targetProvider),
      model: modelForProviderSwitch(current.id === account.providerId ? current.model : '', targetProvider)
    })
    modelFetchSeq.current += 1
    setModels([])
    setTestResult(null)
    setModelFetchResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TrackStatusPanel track={track} provider={provider} current={current} lang={lang} />

      {/* ── Provider Selection ── */}
      <SectionHeading labelKey="switchProvider" lang={lang} />
      <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>{t('switchProviderHint', lang)}</div>
      <label style={labelS()}>
        {t('useProviderAccount', lang)}
        <select value={current.accountId || ''} onChange={e => selectAccount(e.target.value)} style={selectS()}>
          <option value="">{t('directProviderConfig', lang)}</option>
          {providerAccounts.map(account => (
            <option key={account.accountId} value={account.accountId}>
              {providerAccountLabel(account, providerMap, lang)}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>
          {currentAccount ? t('providerAccountLinked', lang) : t('providerAccountHint', lang)}
        </span>
      </label>
      {savedProfiles.length > 0 && (
        <label style={labelS()}>
          {t('savedProfiles', lang)}
          <select
            value=""
            onChange={e => {
              const profile = savedProfiles.find(item => (item.profileId || profileKey(track, item)) === e.target.value)
              if (profile) selectProfile(profile)
            }}
            style={selectS()}
          >
            <option value="">{t('selectSavedProfile', lang)}</option>
            {savedProfiles.map(profile => {
              const key = profile.profileId || profileKey(track, profile)
              return <option key={key} value={key}>{profileDisplayName(track, profile, allVisibleProviders, lang)}</option>
            })}
          </select>
        </label>
      )}
      <label style={labelS()}>
        {t('provider', lang)}
        <select
          value={isExecutableProvider(provider) ? selectedProviderId || '' : ''}
          onChange={e => {
            const nextProvider = allVisibleProviders.find(p => p.id === e.target.value)
            if (!nextProvider) return
            setBillingView(billingGroup(nextProvider, track))
            selectProvider(nextProvider)
          }}
          style={selectS()}
          disabled={providerSelectOptions.length === 0}
        >
          <option value="">{t('selectProvider', lang)}</option>
          {providerSelectOptions.map(p => {
            const info = providerInfo(p, track)
            return (
              <option key={p.id} value={p.id}>
                {providerDisplayName(p, lang, track)} · {p.platform} · {billingLabel(info.billing?.mode, lang)}
              </option>
            )
          })}
        </select>
      </label>
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
      {/* ── Current Provider Config ── */}
      {!isExecutableProvider(provider) ? (
        <NonExecutableInfoCard provider={provider} track={track} lang={lang} />
      ) : (
        <>
          <SectionHeading labelKey="currentProviderConfig" lang={lang} />
          <CurrentProviderLinks provider={provider} track={track} lang={lang} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={chipS('var(--success)')}>{callModeLabel(provider.callMode, lang)}</span>
            <span style={chipS('var(--accent)')}>{setupModeLabel(provider.setupMode, lang)}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
            {callModeDescription(provider, lang)}
          </div>
          <ProviderReadiness
            items={readinessItems}
            onApplyRecommended={handleApplyRecommended}
            canApplyRecommended={canApplyRecommended}
            lang={lang}
          />
          {showMainAuthMode && (
            <label style={labelS()}>
              {t('authMode', lang)}
              <select
                value={current.customAuth?.type || ''}
                onChange={e => onChange(track, { customAuth: { ...(current.customAuth || {}), type: e.target.value } })}
                style={selectS()}
              >
                <option value="">{t('authBearer', lang)}</option>
                <option value="bearer">{t('authBearer', lang)}</option>
                <option value="api-key">{t('authApiKey', lang)}</option>
                <option value="header">{t('authHeader', lang)}</option>
                <option value="query">{t('authQuery', lang)}</option>
                <option value="session">{t('authSession', lang)}</option>
                <option value="none">{t('authNone', lang)}</option>
              </select>
            </label>
          )}
          {!credentialRequired && (
            <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
              {authHint}
            </div>
          )}
          {!usesSessionAuth && credentialRequired && (
            <label style={labelS()}>
              {credentialLabel}
              <input type="password" value={apiKeyValue} placeholder={apiKeyRedacted ? t('configuredPlaceholder', lang) : t('credentialPlaceholder', lang)} onChange={e => onChange(track, { apiKey: e.target.value })} style={inputS()} />
              <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>{authHint}</span>
            </label>
          )}
          {usesSessionAuth && credentialRequired && (
            <label style={labelS()}>
              {t('sessionToken', lang)}
              <input type="password" value={sessionTokenValue} placeholder={sessionTokenRedacted ? t('configuredPlaceholder', lang) : 'sess-...'} onChange={e => onChange(track, { sessionToken: e.target.value })} style={inputS()} />
              <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>{authHint}</span>
            </label>
          )}
          {showMainBaseUrl && (
            <label style={labelS()}>
              <span>{t('baseUrl', lang)}<PresetBadge show={current.baseUrl === provider?.defaultUrl && Boolean(provider?.defaultUrl)} lang={lang} /></span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={current.baseUrl || ''} placeholder={provider?.defaultUrl || 'https://api.example.com'} onChange={e => onChange(track, { baseUrl: e.target.value })} style={{ ...inputS(), flex: 1 }} />
                <button onClick={handleRestoreUrl} title={t('restoreDefault', lang)} style={{ padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                  <Ic n="refresh" size={12} />
                </button>
              </div>
            </label>
          )}
          <label style={labelS()}>
            <span>{t('model', lang)}<PresetBadge show={current.model === provider?.defaultModel && Boolean(provider?.defaultModel)} lang={lang} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={current.model || ''}
                  placeholder={modelSearch ? t('manualModel', lang) : provider?.defaultModel || t('manualModel', lang)}
                  onChange={e => {
                    onChange(track, { model: e.target.value })
                    setModelSearch(e.target.value)
                  }}
                  style={{ ...inputS(), flex: 1 }}
                />
                <button
                  onClick={fetchModelList}
                  disabled={loadingModels || !credentialReady || !effectiveBaseUrl}
                  title={t('refreshModels', lang)}
                  style={{ ...btnS(false), padding: '8px 10px', opacity: loadingModels || !credentialReady || !effectiveBaseUrl ? 0.45 : 1 }}
                >
                  {loadingModels ? '...' : <Ic n="refresh" size={12} />}
                </button>
              </div>
              {modelRecords.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={modelSearch}
                    placeholder={t('searchModels', lang)}
                    onChange={e => setModelSearch(e.target.value)}
                    style={{ ...inputS(), flex: '1 1 180px', minWidth: 0 }}
                  />
                  <button onClick={() => setShowAllModels(!showAllModels)} style={{ ...btnS(false), padding: '7px 9px', fontSize: 11 }}>
                    {showAllModels ? t('showRecommendedModels', lang) : t('showAllModels', lang)}
                  </button>
                </div>
              )}
              {visibleModelRecords.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 168, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 6, background: 'var(--bg-surface)' }}>
                  {visibleModelRecords.slice(0, 80).map(record => (
                    <button
                      key={record.id}
                      onClick={() => onChange(track, { model: record.id })}
                      style={{ ...btnS(false), justifyContent: 'space-between', padding: '6px 8px', color: current.model === record.id ? 'var(--accent)' : 'var(--text-secondary)' }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.id}</span>
                      <span style={chipS(record.capability === 'image' ? 'var(--success)' : record.capability === 'chat' ? 'var(--accent)' : 'var(--text-muted)')}>
                        {modelCapabilityLabel(record.capability, lang)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {modelOptions.length === 0 && modelRecords.length > 0 && (
                <input
                  readOnly
                  value={t('noMatchingModels', lang)}
                  style={{ ...inputS(), color: 'var(--text-muted)' }}
                />
              )}
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>{t('modelCatalogHint', lang)}</span>
            {modelFetchResult && (
              <span style={{ color: modelFetchResult.ok ? 'var(--success)' : modelFetchResult.warning ? 'var(--text-muted)' : 'var(--danger)', fontSize: 11, lineHeight: 1.4 }}>
                {modelFetchResult.ok ? '✓ ' : modelFetchResult.warning ? '! ' : '✗ '}{modelFetchResult.msg}
              </span>
            )}
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleTest} disabled={testing || !credentialReady} style={{ ...btnS(false), opacity: !credentialReady ? 0.4 : 1 }}>
              {testing ? t('testing', lang) : t('connectTest', lang)}
            </button>
            {track === 'image' && (
              <button onClick={handleImageTest} disabled={imageTesting || !credentialReady} style={{ ...btnS(false), opacity: !credentialReady ? 0.4 : 1 }}>
                {imageTesting ? t('testing', lang) : t('imageGenTest', lang)}
              </button>
            )}
            <button onClick={handleClear} style={{ ...btnS(false), color: 'var(--danger)' }}>
              {t('clearConfig', lang)}
            </button>
          </div>
          {testResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: testResult.ok ? (testResult.warning ? 'var(--text-muted)' : 'var(--success)') : 'var(--danger)', fontFamily: 'var(--font-body)' }}>
                {testResult.ok ? `${testResult.warning ? '!' : '✓'} ${testResult.msg || t('connectionReady', lang)}` : `✗ ${testResult.msg}`}
              </div>
              {testResult.imageUrl && (
                <SafeImagePreview url={testResult.imageUrl} />
              )}
            </div>
          )}
        </>
      )}

      {/* ── Advanced options ── */}
      {isExecutableProvider(provider) && (
        <details open={showAdvanced} onToggle={e => setShowAdvanced(e.target.open)}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)', userSelect: 'none' }}>{t('advanced', lang)}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10, borderLeft: '2px solid var(--border-subtle)', marginLeft: 4, paddingLeft: 12 }}>
            {!showMainBaseUrl && (
              <label style={labelS()}>
                <span>{t('baseUrl', lang)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({t('optional', lang)})</span><PresetBadge show={current.baseUrl === provider?.defaultUrl && Boolean(provider?.defaultUrl)} lang={lang} /></span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={current.baseUrl || ''} placeholder={provider?.defaultUrl || ''} onChange={e => onChange(track, { baseUrl: e.target.value })} style={{ ...inputS(), flex: 1 }} />
                  <button onClick={handleRestoreUrl} title={t('restoreDefault', lang)} style={{ padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                    <Ic n="refresh" size={12} />
                  </button>
                </div>
              </label>
            )}
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
            <label style={labelS()}>
              {t('pathPrefix', lang)}
              <input type="text" value={current.pathPrefix || ''} placeholder={provider?.pathPrefix || '/v1'} onChange={e => onChange(track, { pathPrefix: e.target.value })} style={inputS()} />
            </label>
            <label style={labelS()}>
              {t('modelListPath', lang)}
              <input type="text" value={current.modelListPath || ''} placeholder={provider?.modelListPath || provider?.modelsPath || '/models'} onChange={e => onChange(track, { modelListPath: e.target.value })} style={inputS()} />
            </label>
            <CustomApiFields track={track} provider={provider} current={current} onChange={onChange} lang={lang} showAuthMode={!showMainAuthMode} />
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


function providerListForAccounts(providers = {}) {
  const byId = allProvidersById(providers)
  return API_KEY_PROVIDER_IDS
    .map(id => byId.get(id))
    .filter(Boolean)
    .filter(provider => provider.executable !== false && provider.integrationStatus !== 'metadata')
}

function accountForProvider(config = {}, providerId, kind = 'api-key') {
  return (config.providerAccounts || []).find(account => account.providerId === providerId && (account.kind || 'api-key') === kind)
}

function upsertAccountList(accounts = [], account) {
  const next = [...accounts]
  const index = next.findIndex(item => item.accountId === account.accountId)
  if (index >= 0) next[index] = { ...next[index], ...account }
  else next.push(account)
  return next
}

function ProviderApiKeysPage({ config, providers, onChange, lang }) {
  const accounts = config.providerAccounts || []
  const providerRows = providerListForAccounts(providers)
  const updateAccount = (provider, patch) => {
    const current = accountForProvider(config, provider.id, 'api-key')
    const account = normalizeProviderAccount({
      ...(current || {}),
      kind: 'api-key',
      providerId: provider.id,
      name: providerDisplayName(provider, lang),
      baseUrl: current?.baseUrl || provider.defaultUrl || '',
      authType: current?.authType || provider.authType,
      protocol: current?.protocol || provider.protocol,
      format: current?.format || provider.format,
      tracks: current?.tracks?.length ? current.tracks : TRACKS.filter(track => providers[track]?.some(item => item.id === provider.id)),
      ...patch
    }, provider)
    onChange('providerAccounts', upsertAccountList(accounts, account))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHeading labelKey="providerApiKeys" lang={lang} />
      <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{t('providerApiKeysDesc', lang)}</div>
      {providerRows.map(provider => {
        const account = accountForProvider(config, provider.id, 'api-key') || normalizeProviderAccount({ kind: 'api-key', providerId: provider.id, name: providerDisplayName(provider, lang), baseUrl: provider.defaultUrl || '', authType: provider.authType, protocol: provider.protocol, format: provider.format }, provider)
        const configured = configuredAccount(account)
        return (
          <div key={provider.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', padding: 12, display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: configured ? 'var(--accent)' : 'var(--border-accent)', display: 'inline-block' }} />
                {providerDisplayName(provider, lang)}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>{provider.platform}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={labelS()}>
                {t('apiKey', lang)}
                <input type="password" value={account.apiKey === REDACTED_API_KEY ? '' : account.apiKey || ''} placeholder={account.apiKey === REDACTED_API_KEY ? t('configuredPlaceholder', lang) : `${t('pasteProviderKey', lang)} ${providerDisplayName(provider, lang)}`} onChange={e => updateAccount(provider, { apiKey: e.target.value })} style={inputS()} />
              </label>
              <label style={labelS()}>
                {t('baseUrl', lang)}
                <input type="text" value={account.baseUrl || ''} placeholder={provider.defaultUrl || 'https://api.example.com'} onChange={e => updateAccount(provider, { baseUrl: e.target.value })} style={inputS()} />
              </label>
              <label style={labelS()}>
                {t('modelListPath', lang)}
                <input type="text" value={account.modelListPath || ''} placeholder={provider.modelListPath || provider.modelsPath || '/models'} onChange={e => updateAccount(provider, { modelListPath: e.target.value })} style={inputS()} />
              </label>
              <label style={labelS()}>
                {t('tracks', lang)}
                <input type="text" value={(account.tracks || []).join(', ')} readOnly style={{ ...inputS(), color: 'var(--text-muted)' }} />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProviderGatewaysPage({ config, providers, onChange, lang }) {
  const accounts = config.providerAccounts || []
    const openAi = providerDefForTrack(providers, 'chat', 'openai') || providerDefById(providers, 'openai')
  const gateway = accounts.find(account => account.kind === 'gateway' && account.providerId === 'openai') || normalizeProviderAccount({
    kind: 'gateway',
    providerId: 'openai',
    name: 'OpenAI-compatible Relay',
    baseUrl: '',
    authType: { type: 'bearer' },
    tracks: ['chat', 'image']
  }, openAi)
  const updateGateway = (patch) => {
    const account = normalizeProviderAccount({ ...gateway, ...patch }, openAi)
    onChange('providerAccounts', upsertAccountList(accounts, account))
    for (const track of account.tracks || []) {
      const providerDef = providerDefForTrack(providers, track, account.providerId)
      if (providers[track]?.some(item => item.id === account.providerId)) {
        const currentProvider = config.providers?.[track] || {}
        onChange(track, {
          ...providerPatchFromAccount(account, providerDef),
          model: modelForProviderSwitch(currentProvider.id === account.providerId ? currentProvider.model : '', providerDef)
        })
      }
    }
  }
  const toggleTrack = (track) => {
    const current = new Set(gateway.tracks || [])
    const removing = current.has(track)
    if (removing) current.delete(track)
    else current.add(track)
    updateGateway({ tracks: Array.from(current).filter(item => ['chat', 'image'].includes(item)) })
    if (removing && config.providers?.[track]?.accountId === gateway.accountId) {
      onChange(track, { accountId: '', accountKind: '' })
    }
  }
  const applyPreset = (presetId) => {
    updateGateway(providerGatewayPresetPatch(presetId))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHeading labelKey="providerGateways" lang={lang} />
      <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{t('providerGatewaysDesc', lang)}</div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('gatewayPreset', lang)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {OPENAI_COMPATIBLE_GATEWAY_PRESETS.map(preset => (
              <button key={preset.id} onClick={() => applyPreset(preset.id)} style={{ ...btnS(false), padding: '6px 9px', fontSize: 11 }}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <label style={labelS()}>
          {t('gatewayName', lang)}
          <input type="text" value={gateway.name || ''} placeholder="OpenAI-compatible Relay" onChange={e => updateGateway({ name: e.target.value })} style={inputS()} />
        </label>
        <label style={labelS()}>
          {t('baseUrl', lang)}
          <input type="text" value={gateway.baseUrl || ''} placeholder="https://relay.example.com" onChange={e => updateGateway({ baseUrl: e.target.value })} style={inputS()} />
        </label>
        <label style={labelS()}>
          {t('apiKey', lang)}
          <input type="password" value={gateway.apiKey === REDACTED_API_KEY ? '' : gateway.apiKey || ''} placeholder={gateway.apiKey === REDACTED_API_KEY ? t('configuredPlaceholder', lang) : t('credentialPlaceholder', lang)} onChange={e => updateGateway({ apiKey: e.target.value })} style={inputS()} />
        </label>
        <label style={labelS()}>
          {t('modelListPath', lang)}
          <input type="text" value={gateway.modelListPath || ''} placeholder="/v1/models" onChange={e => updateGateway({ modelListPath: e.target.value })} style={inputS()} />
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['chat', 'image'].map(track => (
            <label key={track} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
              <input type="checkbox" checked={(gateway.tracks || []).includes(track)} onChange={() => toggleTrack(track)} />
              {t(track, lang)}
            </label>
          ))}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>{t('gatewayManualModelHint', lang)}</div>
      </div>
    </div>
  )
}

function ProviderAccountsPage({ providers, lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHeading labelKey="providerAccounts" lang={lang} />
      <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{t('providerAccountsDesc', lang)}</div>
      {OAUTH_PLACEHOLDER_ACCOUNTS.map(item => {
        const provider = providerDefById(providers, item.providerId)
        return (
          <div key={item.providerId} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--border-accent)', display: 'inline-block' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>{item.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{t(item.descriptionKey, lang)}</div>
            </div>
            {provider?.links?.home && (
              <button onClick={() => openExternal(provider.links.home)} style={{ ...btnS(false), padding: '6px 9px', fontSize: 11 }}>
                <Ic n="external" size={11} /> {t('viewMaterials', lang)}
              </button>
            )}
          </div>
        )
      })}
      <div style={{ color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 11, lineHeight: 1.5 }}>
        {t('oauthBoundaryNotice', lang)}
      </div>
    </div>
  )
}

/* ── Main Settings ── */
function normalizeSettingsPage(page, videoEnabled) {
  if (page === 'api' || page === 'chat' || page === 'image' || page === 'video') return 'model-pairing'
  if (page === 'api-chat' || page === 'api-image' || page === 'api-video') return 'model-pairing'
  return page || 'appearance'
}

export default function Settings({ config, providerLists, onSave, onClose, initialPage = 'appearance' }) {
  const [page, setPage] = useState(() => normalizeSettingsPage(initialPage, config?.general?.enableVideo === true))
  const [local, setLocal] = useState(config)
  const [expanded, setExpanded] = useState({ general: true, api: true })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
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
    const handler = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, saving])

  const lang = local?.general?.language || 'zh'
  const providers = {
    chat: providerLists?.chat?.length ? providerLists.chat : CHAT_PROVIDERS,
    image: providerLists?.image?.length ? providerLists.image : IMG_PROVIDERS,
    video: providerLists?.video?.length ? providerLists.video : VID_PROVIDERS
  }

  const handleChange = (track, patch) => {
    if (!local) return
    if (saveError) setSaveError('')
    if (track === 'general') setLocal(prev => ({ ...prev, general: { ...prev.general, ...patch } }))
    else if (track === 'providerAccounts') setLocal(prev => ({ ...prev, providerAccounts: patch }))
    else if (track === 'providerProfiles') setLocal(prev => ({ ...prev, providerProfiles: { ...prev.providerProfiles, ...patch } }))
    else if (track === '_deletedProfileKeys') setLocal(prev => ({ ...prev, _deletedProfileKeys: patch }))
    else setLocal(prev => ({ ...prev, providers: { ...prev.providers, [track]: { ...prev.providers[track], ...patch } } }))
  }

  const handleSave = async () => {
    if (!local || saving) return
    setSaving(true)
    try {
      await onSave(local)
      onClose()
    } catch (err) {
      console.error('Failed to save settings:', err)
      setSaveError(t('saveFailed', lang))
      setSaving(false)
    }
  }

  if (!local) return null
  const videoApiEnabled = local?.general?.enableVideo === true

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-dark)', backdropFilter: 'blur(4px)' }} onClick={() => { if (!saving) onClose() }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 860, maxWidth: '92vw', maxHeight: '84vh', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', fontFamily: 'var(--font-body)', animation: 'scaleIn 0.2s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings', lang)}</span>
          <button onClick={() => { if (!saving) onClose() }} disabled={saving} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease', opacity: saving ? 0.5 : 1
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
            {page === 'provider-accounts' && <ProviderAccountsPage providers={providers} lang={lang} />}
            {page === 'provider-api-keys' && <ProviderApiKeysPage config={local} providers={providers} onChange={handleChange} lang={lang} />}
            {page === 'provider-gateways' && <ProviderGatewaysPage config={local} providers={providers} onChange={handleChange} lang={lang} />}
            {page === 'model-pairing' && <ModelPairingPage config={local} providers={providers} onChange={handleChange} lang={lang} />}
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, color: 'var(--danger)', fontSize: 12, minHeight: 18 }}>
            {saveError}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => { if (!saving) onClose() }} disabled={saving} style={{ ...btnS(false), opacity: saving ? 0.5 : 1 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-accent)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          >{t('cancel', lang)}</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnS(true), opacity: saving ? 0.7 : 1 }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = btnS(true).boxShadow }}
          >{saving ? t('saving', lang) : t('save', lang)}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
