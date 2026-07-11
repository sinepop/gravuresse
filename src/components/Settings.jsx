import { useState, useEffect, useCallback } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { t } from '../i18n'
import Ic from './icons'
import { btnS } from './settings/shared.jsx'
import AccountsPage from './settings/AccountsPage.jsx'
import ApiKeysPage from './settings/ApiKeysPage.jsx'
import RelaysPage from './settings/RelaysPage.jsx'
import DefaultsPage from './settings/DefaultsPage.jsx'

const NAV_SECTIONS = [
  { id: 'api', label: { zh: '提供商设置', en: 'Provider Settings' }, icon: 'link', children: [
    { id: 'accounts', label: { zh: '账号', en: 'Accounts' } },
    { id: 'api-keys', label: { zh: 'API 密钥', en: 'API Keys' } },
    { id: 'relays', label: { zh: '自定义（中转）', en: 'Custom Relay' } },
    { id: 'defaults', label: { zh: '默认模型搭配', en: 'Default Model Pairing' } },
  ]},
]

function normalizeSettingsPage(page) {
  if (page === 'appearance' || page === 'lang' || page === 'other' || page === 'general') return 'accounts'
  if (page === 'chat' || page === 'image' || page === 'video') return 'accounts'
  if (page === 'api-chat' || page === 'api-image' || page === 'api-video') return 'accounts'
  if (page === 'model-pairing') return 'defaults'
  if (page === 'provider-accounts') return 'accounts'
  if (page === 'provider-api-keys') return 'api-keys'
  if (page === 'provider-gateways') return 'relays'
  if (page === 'api') return 'accounts'
  return page || 'accounts'
}

function PreferenceSelect({ label, value, onChange, children, disabled }) {
  return <label style={{ display: 'grid', gap: 4, minWidth: 120, color: 'var(--text-muted)', fontSize: 11 }}>
    {label}
    <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} style={{ height: 30, padding: '0 8px', color: 'var(--text-primary)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>{children}</select>
  </label>
}

function PreferenceToggle({ label, checked, onChange, disabled }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 30, color: 'var(--text-secondary)', fontSize: 11, cursor: disabled ? 'wait' : 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} />
    {label}
  </label>
}

export default function Settings({ config, providerLists, onSave, onClose, onCanonicalChange, initialPage = 'accounts' }) {
  const [page, setPage] = useState(() => normalizeSettingsPage(initialPage))
  const [local, setLocal] = useState(config)
  const [expanded, setExpanded] = useState({ api: true })
  const [saving, setSaving] = useState(false)
  const [pageBusy, setPageBusy] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [showGeneral, setShowGeneral] = useState(false)
  useEffect(() => { if (config) setLocal(config) }, [config])
  useEffect(() => {
    if (!initialPage) return
    setPageBusy(true)
    setPage(normalizeSettingsPage(initialPage))
  }, [initialPage])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !saving && !pageBusy) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, saving, pageBusy])

  const lang = local?.general?.language || 'zh'
  const providers = {
    chat: providerLists?.chat?.length ? providerLists.chat : CHAT_PROVIDERS,
    image: providerLists?.image?.length ? providerLists.image : IMG_PROVIDERS,
    video: providerLists?.video?.length ? providerLists.video : VID_PROVIDERS
  }

  // Provider pages persist credentials in the main process immediately. Keep
  // the modal snapshot canonical so the footer Save cannot overwrite them.
  const handleCanonicalConnections = useCallback((connections) => {
    if (!connections) return
    setLocal(prev => ({ ...prev, connections }))
    onCanonicalChange?.(connections)
  }, [onCanonicalChange])

  const saveGeneral = async (patch) => {
    if (!local || saving || pageBusy) return
    const previous = local
    const next = { ...local, general: { ...local.general, ...patch } }
    setLocal(next)
    setSaving(true)
    setSaveError('')
    try {
      await onSave(next)
    } catch (err) {
      console.error('Failed to save settings:', err)
      setLocal(previous)
      setSaveError(t('saveFailed', lang))
    } finally {
      setSaving(false)
    }
  }

  if (!local) return null
  const busy = saving || pageBusy

  return (
    <div className="settings-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="settings-modal glass-overlay glass-specular" role="dialog" aria-modal="true" aria-label={lang === 'en' ? 'Provider Settings' : '\u63d0\u4f9b\u5546\u8bbe\u7f6e'} onClick={e => e.stopPropagation()} style={{ width: 860, maxWidth: '92vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-body)', animation: 'scaleIn 0.2s ease' }}>
        <div className="settings-chrome" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{lang === 'en' ? 'Provider Settings' : '\u63d0\u4f9b\u5546\u8bbe\u7f6e'}</span>
          <button onClick={() => setShowGeneral(value => !value)} aria-expanded={showGeneral} style={{ marginLeft: 'auto', marginRight: 8, ...btnS(false), height: 32, padding: '0 12px' }}>
            <Ic n="gear" size={14} sw={1.8} /> {lang === 'en' ? 'General' : '\u901a\u7528'}
          </button>
          <button onClick={() => { if (!busy) onClose() }} disabled={busy} aria-label={lang === 'en' ? 'Close settings' : '\u5173\u95ed\u8bbe\u7f6e'} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease', opacity: busy ? 0.5 : 1
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
          ><Ic n="close" size={16} sw={2} /></button>
        </div>
        {showGeneral && <div className="settings-preferences solid-surface" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '10px 16px' }}>
          <div style={{ flexBasis: '100%', color: 'var(--text-primary)', fontSize: 'var(--font-size-lg)', fontWeight: 650 }}>{lang === 'en' ? 'General settings' : '\u901a\u7528\u8bbe\u7f6e'}</div>
          <PreferenceSelect label={lang === 'en' ? 'Language' : '\u8bed\u8a00'} value={local.general?.language || 'zh'} onChange={value => saveGeneral({ language: value })} disabled={busy}>
            <option value="zh">中文</option><option value="en">English</option>
          </PreferenceSelect>
          <PreferenceSelect label={lang === 'en' ? 'Theme' : '\u4e3b\u9898'} value={local.general?.theme || 'light'} onChange={value => saveGeneral({ theme: value })} disabled={busy}>
            <option value="light">{lang === 'en' ? 'Light' : '\u6d45\u8272'}</option><option value="dark">{lang === 'en' ? 'Dark' : '\u6df1\u8272'}</option><option value="system">{lang === 'en' ? 'System' : '\u8ddf\u968f\u7cfb\u7edf'}</option>
          </PreferenceSelect>
          <PreferenceSelect label={lang === 'en' ? 'Font size' : '\u5b57\u53f7'} value={local.general?.fontSize || 'medium'} onChange={value => saveGeneral({ fontSize: value })} disabled={busy}>
            <option value="small">{lang === 'en' ? 'Small' : '\u5c0f'}</option><option value="medium">{lang === 'en' ? 'Medium' : '\u4e2d'}</option><option value="large">{lang === 'en' ? 'Large' : '\u5927'}</option>
          </PreferenceSelect>
          <PreferenceToggle label={lang === 'en' ? 'Reference images' : '\u53c2\u8003\u56fe'} checked={local.general?.enableReference === true} onChange={value => saveGeneral({ enableReference: value })} disabled={busy} />
          <PreferenceToggle label={lang === 'en' ? 'Video workspace' : '\u89c6\u9891\u5de5\u4f5c\u533a'} checked={local.general?.enableVideo === true} onChange={value => saveGeneral({ enableVideo: value })} disabled={busy} />
          <PreferenceToggle label={lang === 'en' ? 'Auto-save history' : '\u81ea\u52a8\u4fdd\u5b58\u5386\u53f2'} checked={local.general?.autoSave !== false} onChange={value => saveGeneral({ autoSave: value })} disabled={busy} />
          <span style={{ flexBasis: '100%', color: 'var(--text-muted)', fontSize: 'var(--font-size-meta)' }}>{lang === 'en' ? 'Changes are saved immediately.' : '\u66f4\u6539\u4f1a\u7acb\u5373\u4fdd\u5b58\u3002'}</span>
        </div>}
        <div className="settings-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div className="settings-sidebar glass-shell" style={{ width: 170, borderRight: '1px solid var(--border-subtle)', padding: '12px 0', overflow: 'auto', flexShrink: 0 }}>
            {NAV_SECTIONS.map(section => (
              <div key={section.id}>
                <button onClick={() => section.children.length > 0 ? setExpanded(prev => ({ ...prev, [section.id]: !prev[section.id] })) : setPage(section.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', background: page === section.id ? 'var(--accent-soft)' : 'none', border: 'none', borderRight: page === section.id ? '2px solid var(--accent)' : '2px solid transparent', color: page === section.id ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                  <Ic n={section.icon} size={13} sw={2} />
                  {section.label ? (section.label[lang] || section.label.zh) : t(section.labelKey, lang)}
                  <span aria-hidden="true" style={{ marginLeft: 'auto', display: 'flex', transition: 'transform 0.15s', transform: expanded[section.id] ? 'rotate(0)' : 'rotate(-90deg)' }}><Ic n="chevDown" size={12} /></span>
                </button>
                {expanded[section.id] && section.children.filter(child => !child.requiresVideo || local?.general?.enableVideo === true).map(child => (
                  <button key={child.id} onClick={() => { if (!busy && child.id !== page) { setPageBusy(true); setPage(child.id) } }} disabled={busy} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 16px 7px 36px', background: page === child.id ? 'var(--accent-soft)' : 'transparent', border: 'none', borderRight: page === child.id ? '2px solid var(--accent)' : '2px solid transparent', color: page === child.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 'var(--font-size-base)', cursor: busy ? 'wait' : 'pointer', opacity: busy && page !== child.id ? 0.55 : 1, fontFamily: 'var(--font-body)', fontWeight: page === child.id ? 500 : 400 }}
                    onMouseEnter={e => { if (page !== child.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (page !== child.id) e.currentTarget.style.background = 'transparent' }}
                  >{child.label ? (child.label[lang] || child.label.zh) : t(child.labelKey, lang)}</button>
                ))}
              </div>
            ))}
          </div>
          <div className="settings-content solid-surface" style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {page === 'accounts' && <AccountsPage onCanonicalChange={handleCanonicalConnections} onBusyChange={setPageBusy} lang={lang} />}
            {page === 'api-keys' && <ApiKeysPage providerLists={providers} onCanonicalChange={handleCanonicalConnections} onBusyChange={setPageBusy} lang={lang} />}
            {page === 'relays' && <RelaysPage onCanonicalChange={handleCanonicalConnections} onBusyChange={setPageBusy} lang={lang} />}
            {page === 'defaults' && <DefaultsPage onCanonicalChange={handleCanonicalConnections} onBusyChange={setPageBusy} lang={lang} />}
          </div>
        </div>
        <div className="settings-chrome" style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, color: 'var(--danger)', fontSize: 12, minHeight: 18 }}>
            {saveError}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-meta)' }}>{lang === 'en' ? 'Provider changes are saved immediately.' : '\u63d0\u4f9b\u5546\u66f4\u6539\u4f1a\u7acb\u5373\u4fdd\u5b58\u3002'}</span>
          <button onClick={() => { if (!busy) onClose() }} disabled={busy} style={{ ...btnS(false), opacity: busy ? 0.5 : 1 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-accent)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          >{busy ? t('saving', lang) : (lang === 'en' ? 'Close' : '\u5173\u95ed')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
