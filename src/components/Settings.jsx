import { useState, useEffect, useRef, useCallback } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { PROVIDER_ID_ALIASES } from '../providers/aliases'
import { t } from '../i18n'
import Ic from './icons'

const NAV_SECTIONS = [
  { id: 'api', labelKey: 'apiConfig', icon: 'link', children: [
    { id: 'image', labelKey: 'image' },
    { id: 'video', labelKey: 'video' },
    { id: 'chat', labelKey: 'chat' },
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
const OPENNANA_PROMPT_GALLERY_URL = 'https://opennana.com/awesome-prompt-gallery'

const LINK_BUTTONS = [
  { key: 'home', labelKey: 'officialSite', icon: 'globe' },
  { key: 'docs', labelKey: 'docs', icon: 'book' },
  { key: 'pricing', labelKey: 'pricing', icon: 'price' },
  { key: 'purchase', labelKey: 'purchaseTopup', icon: 'card' },
  { key: 'console', labelKey: 'console', icon: 'server' },
  { key: 'apiKey', labelKey: 'apiKeyPage', icon: 'key' },
]

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
      pricing: 'https://docs.byteplus.com/en/docs/ModelArk/1544106',
      console: 'https://console.volcengine.com/ark',
      apiKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey'
    },
    billing: { mode: 'paygo' },
    meta: { region: 'china' },
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
  return provider?.executable !== false && provider?.integrationStatus !== 'metadata'
}

function providerInfo(provider = {}, track) {
  const base = FALLBACK_PROVIDER_METADATA[provider.id] || {}
  const trackMeta = TRACK_PROVIDER_METADATA[track]?.[provider.id] || {}
  return {
    links: { ...(base.links || {}), ...(trackMeta.links || {}), ...(provider.meta?.links || {}), ...(provider.links || {}) },
    billing: provider.billing || provider.meta?.billing || trackMeta.billing || base.billing || { mode: 'unknown' },
    region: provider.meta?.region || trackMeta.meta?.region || base.meta?.region || 'unknown',
    capabilities: provider.capabilities?.[track] || provider.meta?.capabilities?.[track] || trackMeta.capabilities?.[track] || {},
    constraints: provider.constraints?.[track] || provider.meta?.constraints?.[track] || trackMeta.constraints || {},
    customizable: provider.customizable?.[track] || provider.meta?.customizable?.[track] || trackMeta.customizable?.[track] || {},
    description: provider.meta?.description || base.meta?.description || '',
    relay: provider.relayCompatible || base.relayCompatible || provider.capabilities?.[track]?.relay
  }
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

function openExternal(url) {
  if (!url) return
  window.electronAPI?.openExternal?.(url).catch?.(() => {})
}

/* ── reusable styles (all CSS variables) ── */
const labelS = () => ({ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: '0.2px' })
const inputS = () => ({ background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', transition: 'all 0.2s ease', lineHeight: 1.5 })
const selectS = () => ({ ...inputS(), appearance: 'auto', cursor: 'pointer', fontFamily: 'var(--font-body)' })
const btnS = (primary) => ({ padding: '8px 22px', background: primary ? 'var(--accent-gradient)' : 'var(--bg-surface)', border: primary ? 'none' : '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: primary ? 'var(--text-white)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: primary ? 600 : 400, transition: 'all 0.2s ease', boxShadow: primary ? 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none' })

function ProviderCard({ track, provider, selected, onSelect, lang }) {
  const info = providerInfo(provider, track)
  const executable = isExecutableProvider(provider)
  const caps = capabilityLabels(info.capabilities, track, lang)
  const constraints = compactConstraints(info.constraints, lang)
  const linkButtons = LINK_BUTTONS.filter(button => info.links?.[button.key])

  return (
    <div style={{
      border: `1px solid ${selected ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
      background: selected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
      borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
            {track === 'image' ? <Ic n="image" size={13} /> : <Ic n="film" size={13} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider.name}</span>
          </div>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 10 }}>{provider.platform} · {regionLabel(info.region, lang)}</div>
        </div>
        <button
          onClick={() => executable && onSelect(provider)}
          disabled={!executable}
          title={executable ? t('provider', lang) : t('metadataOnly', lang)}
          style={{
            ...btnS(false),
            padding: '5px 8px',
            fontSize: 11,
            opacity: executable ? 1 : 0.45,
            color: selected ? 'var(--accent)' : 'var(--text-secondary)'
          }}
        >
          {selected ? <Ic n="check" size={12} /> : executable ? <Ic n="plus" size={12} /> : <Ic n="book" size={12} />}
        </button>
      </div>

      {info.description && <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45 }}>{info.description}</div>}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span style={chipS('var(--accent)')}>{billingLabel(info.billing?.mode, lang)}</span>
        <span style={chipS(info.relay || info.capabilities?.customTemplate ? 'var(--success)' : 'var(--text-muted)')}>
          {info.relay || info.capabilities?.customTemplate ? t('relaySupported', lang) : t('relayOfficialOnly', lang)}
        </span>
        {!executable && <span style={chipS('var(--text-muted)')}>{t('metadataOnly', lang)}</span>}
      </div>

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{t('apiWorkbench', lang)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{t('apiWorkbenchDesc', lang)}</div>
        </div>
        {(track === 'image' || track === 'video') && (
          <button onClick={() => openExternal(OPENNANA_PROMPT_GALLERY_URL)} style={{ ...btnS(false), padding: '7px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Ic n="sparkle" size={12} />{t('openNanaGallery', lang)}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        {providers.map(p => (
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
function ProviderTab({ track, providers, config, onChange, lang }) {
  const current = config?.providers?.[track] || {}
  const selectableProviders = providers.filter(isExecutableProvider)
  const selectable = selectableProviders.length ? selectableProviders : providers
  const selectedProviderId = resolveProviderId(track, current.id, selectable)
  const provider = providers.find(p => p.id === selectedProviderId) || selectable[0]
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
    if (!isExecutableProvider(p)) return
    onChange(track, { id: p.id, apiKey: '', sessionToken: '', customAuth: {}, baseUrl: p.defaultUrl || '', model: p.defaultModel || '', protocol: p.protocol, format: p.format })
    setModels([])
    setTestResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProviderWorkbench track={track} providers={providers} selectedProviderId={selectedProviderId} onSelect={selectProvider} lang={lang} />
      <label style={labelS()}>
        {t('provider', lang)}
        <select value={selectedProviderId} onChange={e => { const p = selectable.find(pp => pp.id === e.target.value); if (p) selectProvider(p) }} style={selectS()}>
          {selectable.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label style={labelS()}>
        {t('apiKey', lang)}
        <input type="password" value={apiKeyValue} placeholder={apiKeyRedacted ? (lang === 'en' ? 'Configured' : '已配置') : 'sk-...'} onChange={e => onChange(track, { apiKey: e.target.value })} style={inputS()} />
      </label>
      {usesSessionAuth && (
        <label style={labelS()}>
          {t('sessionToken', lang)}
          <input type="password" value={sessionTokenValue} placeholder={sessionTokenRedacted ? (lang === 'en' ? 'Configured' : '已配置') : 'sess-...'} onChange={e => onChange(track, { sessionToken: e.target.value })} style={inputS()} />
        </label>
      )}
      <label style={labelS()}>
        {t('baseUrl', lang)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({t('optional', lang)})</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="text" value={current.baseUrl || ''} placeholder={provider?.defaultUrl || ''} onChange={e => onChange(track, { baseUrl: e.target.value })} style={{ ...inputS(), flex: 1 }} />
          <button onClick={handleRestoreUrl} title={t('restoreDefault', lang)} style={{ padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
            <Ic n="refresh" size={12} />
          </button>
        </div>
      </label>
      <label style={labelS()}>
        {t('model', lang)}
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

      {/* Advanced options */}
      <details open={showAdvanced} onToggle={e => setShowAdvanced(e.target.open)}>
        <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', userSelect: 'none' }}>{t('advanced', lang)}</summary>
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
        <select value={g.theme || 'dark'} onChange={e => onChange('general', { theme: e.target.value })} style={selectS()}>
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
export default function Settings({ config, providerLists, onSave, onClose }) {
  const [page, setPage] = useState('appearance')
  const [local, setLocal] = useState(config)
  const [expanded, setExpanded] = useState({ general: true, api: true })
  useEffect(() => { if (config) setLocal(config) }, [config])

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
    else setLocal(prev => ({ ...prev, providers: { ...prev.providers, [track]: { ...prev.providers[track], ...patch } } }))
  }

  const handleSave = () => { if (local) { onSave(local); onClose() } }

  if (!local) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-dark)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 680, maxHeight: '80vh', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', fontFamily: 'var(--font-body)', animation: 'scaleIn 0.2s ease' }}>
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
                {expanded[section.id] && section.children.map(child => (
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
            {page === 'chat' && <ProviderTab track="chat" providers={providers.chat} config={local} onChange={(t2, patch) => handleChange('chat', patch)} lang={lang} />}
            {page === 'image' && <ImagePage config={local} providers={providers.image} onChange={handleChange} lang={lang} />}
            {page === 'video' && <VideoPage config={local} providers={providers.video} onChange={handleChange} lang={lang} />}
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
