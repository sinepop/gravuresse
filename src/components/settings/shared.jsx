// @ts-check

import { t } from '../../i18n'
import Ic from '../icons'

/** @typedef {import('../../types/domain').ProviderProfile} ProviderProfile */
/** @typedef {import('../../types/domain').ProviderValidationStatus} ProviderValidationStatus */
/** @typedef {import('../../types/domain').Track} Track */
/** @typedef {{ key: string, labelKey: string, icon: Parameters<typeof Ic>[0]['n'] }} ProviderLinkButton */

/* --- Constants --- */
export const REDACTED_API_KEY = '********'
/** @type {Track[]} */
export const TRACKS = ['chat', 'image', 'video']

/* --- Style Helpers --- */
/** @returns {React.CSSProperties} */
export const labelS = () => ({
  display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13,
  color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
  fontWeight: 400, letterSpacing: '0.2px'
})

/** @returns {React.CSSProperties} */
export const inputS = () => ({
  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', padding: '9px 12px',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)',
  outline: 'none', transition: 'all 0.2s ease', lineHeight: 1.5
})

/** @returns {React.CSSProperties} */
export const selectS = () => ({
  ...inputS(), appearance: 'auto', cursor: 'pointer', fontFamily: 'var(--font-body)'
})

/** @param {boolean} primary @returns {React.CSSProperties} */
export const btnS = (primary) => ({
  padding: '8px 22px',
  background: primary ? 'var(--accent-gradient)' : 'var(--bg-surface)',
  border: primary ? 'none' : '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: primary ? 'var(--text-white)' : 'var(--text-secondary)',
  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
  fontWeight: primary ? 600 : 400, transition: 'all 0.2s ease',
  boxShadow: primary ? 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none'
})

/** @param {string} [color='var(--text-muted)'] @returns {React.CSSProperties} */
export const chipS = (color = 'var(--text-muted)') => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px',
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)', color, fontSize: 'var(--font-size-meta)', lineHeight: 1.3
})

/** @param {unknown} mode @param {Track} track @returns {React.CSSProperties} */
export function billingChipS(mode, track) {
  const highRisk = track === 'video' || mode === 'subscription'
  if (mode === 'paygo') return { ...chipS('var(--success)'), borderColor: 'var(--success-soft)', background: 'var(--success-soft)' }
  if (mode === 'credits') return { ...chipS(highRisk ? 'var(--danger)' : 'var(--accent)'), borderColor: highRisk ? 'var(--danger-border)' : 'var(--border-accent)', background: highRisk ? 'var(--danger-soft)' : 'var(--accent-soft)' }
  if (mode === 'subscription') return { ...chipS('var(--danger)'), borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }
  return chipS()
}

/* --- Text Helpers --- */
/** @param {string} lang @param {string} zh @param {string} en */
export function localText(lang, zh, en) {
  return lang === 'en' ? en : zh
}

/** @param {unknown} url */
export function openExternal(url) {
  if (typeof url !== 'string' || !url) return
  window.electronAPI?.openExternal?.(url).catch?.(() => {})
}

/* --- Provider Display --- */
/** @param {ProviderProfile} provider @param {string} lang @param {Track} [track='chat'] */
export function providerDisplayName(provider = {}, lang, track = 'chat') {
  if (provider.id === 'volcengine') {
    if (track === 'image') return lang === 'en' ? 'Seedream / Jimeng' : 'Seedream / 即梦'
    if (track === 'video') return lang === 'en' ? 'Seedance / Jimeng' : 'Seedance / 即梦'
    return lang === 'en' ? 'Doubao / Volcengine ModelArk' : '豆包 / 火山方舟'
  }
  if (lang === 'en') {
    const part = String(provider.name || '').split('/').map(s => s.trim()).find(s => s && !/[一-鿿]/.test(s))
    return part || provider.name || ''
  }
  const part = String(provider.name || '').split('/').map(s => s.trim()).find(s => s && /[一-鿿]/.test(s))
  return part || provider.name || ''
}

/* --- Label Helpers --- */
/** @param {unknown} mode @param {string} lang */
export function billingLabel(mode, lang) {
  if (mode === 'paygo') return t('billingPaygo', lang)
  if (mode === 'credits') return t('billingCredits', lang)
  if (mode === 'subscription') return t('billingSubscription', lang)
  return t('billingUnknown', lang)
}

/** @param {unknown} region @param {string} lang */
export function regionLabel(region, lang) {
  const regionKey = typeof region === 'string' ? region : ''
  /** @type {Record<string, string>} */
  const keys = {
    global: 'regionGlobal',
    china: 'regionChina',
    both: 'regionBoth'
  }
  const key = keys[regionKey] || 'regionUnknown'
  return t(key, lang)
}

/** @param {ProviderValidationStatus | null | undefined} validation @param {string} lang */
export function validationEvidenceLabel(validation, lang) {
  if (!validation) return ''
  if (validation.evidence === 'assistant_output' || validation.outputVerified === true) {
    return t('validationOutputVerified', lang)
  }
  if (validation.evidence === 'protocol_response') return t('validationRequestVerified', lang)
  if (
    validation.evidence === 'model_directory' ||
    validation.status === 'directory_verified' ||
    validation.level === 'model_directory'
  ) return t('validationDirectoryOnly', lang)
  return ''
}

/** @param {unknown} status @param {string} lang */
export function statusLabel(status, lang) {
  const statusKey = typeof status === 'string' ? status : ''
  const locale = lang === 'en' ? 'en' : 'zh'
  /** @type {Record<string, { zh: string, en: string }>} */
  const map = {
    verified: { zh: '已验证', en: 'Verified' },
    connected_unverified: { zh: '已连接·未验证', en: 'Connected · unverified' },
    directory_verified: { zh: '仅目录已验证', en: 'Directory only' },
    available: { zh: '可连接', en: 'Available' },
    registration_required: { zh: '待官方注册', en: 'Registration required' },
    authenticated_unavailable: { zh: '已认证，暂不可执行', en: 'Authenticated, unavailable' },
    unavailable: { zh: '不可用', en: 'Unavailable' },
    pending: { zh: '等待授权', en: 'Awaiting authorization' },
    exchanging: { zh: '验证授权中', en: 'Exchanging token' },
    expired: { zh: '已过期', en: 'Expired' },
    cancelled: { zh: '已取消', en: 'Cancelled' },
    detected: { zh: '已检测', en: 'Detected' },
    pending_configuration: { zh: '待配置', en: 'Pending config' },
    unsupported: { zh: '待实现', en: 'Not implemented' },
    not_detected: { zh: '未检测到', en: 'Not found' },
    error: { zh: '错误', en: 'Error' },
  }
  return map[statusKey]?.[locale] || statusKey || '—'
}

/** @param {unknown} status */
export function statusColor(status) {
  if (status === 'verified') return 'var(--success)'
  if (status === 'detected' || status === 'available' || status === 'directory_verified') return 'var(--accent)'
  if (status === 'pending_configuration' || status === 'registration_required' || status === 'authenticated_unavailable' || status === 'unsupported' || status === 'unavailable' || status === 'connected_unverified' || status === 'pending' || status === 'exchanging') return '#f59e0b'
  if (status === 'error') return 'var(--danger)'
  return 'var(--text-muted)'
}

/** @param {number | null | undefined} ms */
export function latencyText(ms) {
  if (!ms && ms !== 0) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/* --- Reusable Sub-Components --- */
/** @param {{ labelKey: string, lang: string }} props */
export function SectionHeading({ labelKey, lang }) {
  return <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{t(labelKey, lang)}</div>
}

/** @param {{ status: string, size?: number }} props */
export function StatusDot({ status, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: size, background: statusColor(status), display: 'inline-block', flexShrink: 0 }} />
}

/** @param {{ status: string, lang: string }} props */
export function StatusBadge({ status, lang }) {
  const color = statusColor(status)
  const bg = status === 'verified' ? 'var(--success-soft)' : status === 'detected' ? 'var(--accent-soft)' : 'var(--bg-surface)'
  return <span style={{ ...chipS(color), borderColor: color, background: bg }}>{statusLabel(status, lang)}</span>
}

/** @param {{ latencyMs?: number | null }} props */
export function LatencyBadge({ latencyMs }) {
  if (!latencyMs && latencyMs !== 0) return null
  return <span style={chipS()}>{latencyText(latencyMs)}</span>
}

/** @param {{ links?: Partial<Record<string, string>>, lang: string, buttons?: ProviderLinkButton[] }} props */
export function ProviderLinkButtons({ links, lang, buttons }) {
  if (!links || !buttons) return null
  const visible = buttons.filter(b => links[b.key])
  if (!visible.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {visible.map(b => (
        <button key={b.key} onClick={() => openExternal(links[b.key])}
          style={{ ...btnS(false), padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Ic n={b.icon} size={11} />{t(b.labelKey, lang)}
        </button>
      ))}
    </div>
  )
}

/** @param {{ message?: React.ReactNode }} props */
export function EmptyState({ message }) {
  if (!message) return null
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
      {message}
    </div>
  )
}
