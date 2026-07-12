// @ts-check

import { useEffect, useState } from 'react'
import { t } from '../i18n'
import Ic from './icons'
import ChatProvidersPage from './settings/ChatProvidersPage.jsx'
import { AppearancePage, LangPage, OtherPage } from './settings/GeneralSettingsPages.jsx'
import { btnS } from './settings/settingsUi.js'

/** @typedef {import('../types/domain').ConfigPayload} ConfigPayload */
/** @typedef {import('../types/domain').ProviderLists} ProviderLists */
/** @typedef {import('../types/domain').ProviderProfile} ProviderProfile */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {(section: string, patch: unknown) => void} SettingsChange */

/** @type {{ id: string, labelKey: string, icon: Parameters<typeof Ic>[0]['n'], children: { id: string, labelKey: string }[] }[]} */
const NAV_SECTIONS = [
  { id: 'api', labelKey: 'apiConfig', icon: 'link', children: [] },
  { id: 'general', labelKey: 'general', icon: 'gear', children: [
    { id: 'appearance', labelKey: 'appearance' },
    { id: 'lang', labelKey: 'language' },
    { id: 'other', labelKey: 'other' }
  ] }
]

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

/** @param {unknown} value @returns {ProviderProfile[]} */
function profileList(value) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

/** @param {string} page */
function normalizeSettingsPage(page) {
  if (page === 'chat' || page === 'image' || page === 'video') return 'api'
  if (page === 'api-chat' || page === 'api-image' || page === 'api-video') return 'api'
  if (page === 'model-pairing' || page.startsWith('provider-')) return 'api'
  return page || 'appearance'
}

/** @param {{ config: ConfigPayload | null, providerLists: ProviderLists, onSave: (config: ConfigPayload) => void | Promise<void>, onClose: () => void, initialPage?: string }} props */
export default function Settings({ config, onSave, onClose, initialPage = 'appearance' }) {
  const [page, setPage] = useState(() => normalizeSettingsPage(initialPage))
  const [local, setLocal] = useState(/** @type {ConfigPayload | null} */ (config))
  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */ ({ general: true, api: true }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { if (config) setLocal(config) }, [config])
  useEffect(() => { if (initialPage) setPage(normalizeSettingsPage(initialPage)) }, [initialPage])

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    const handler = (event) => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, saving])

  const lang = text(recordOf(local?.general).language) || 'zh'

  /** @type {SettingsChange} */
  const handleChange = (section, patch) => {
    if (!local) return
    if (saveError) setSaveError('')
    if (section === 'general') setLocal(current => current ? ({ ...current, general: { ...recordOf(current.general), ...recordOf(patch) } }) : current)
    else if (section === 'chatProviders') setLocal(current => current ? ({ ...current, chatProviders: profileList(patch) }) : current)
  }

  const handleSave = async () => {
    if (!local || saving) return
    setSaving(true)
    try {
      await onSave(local)
      onClose()
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSaveError(t('saveFailed', lang))
      setSaving(false)
    }
  }

  if (!local) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-dark)', backdropFilter: 'blur(4px)' }} onClick={() => { if (!saving) onClose() }}>
      <div onClick={event => event.stopPropagation()} style={{ width: 860, maxWidth: '92vw', maxHeight: '84vh', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', fontFamily: 'var(--font-body)', animation: 'scaleIn 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings', lang)}</span>
          <button onClick={() => { if (!saving) onClose() }} disabled={saving} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease', opacity: saving ? 0.5 : 1 }}>
            <Ic n="close" size={16} sw={2} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: 170, borderRight: '1px solid var(--border-subtle)', padding: '12px 0', overflow: 'auto', flexShrink: 0 }}>
            {NAV_SECTIONS.map(section => (
              <div key={section.id}>
                <button onClick={() => section.children.length ? setExpanded(current => ({ ...current, [section.id]: !current[section.id] })) : setPage(section.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', background: page === section.id ? 'var(--accent-soft)' : 'none', border: 'none', borderRight: page === section.id ? '2px solid var(--accent)' : '2px solid transparent', color: page === section.id ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                  <Ic n={section.icon} size={13} sw={2} />
                  {t(section.labelKey, lang)}
                  {section.children.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 10, transition: 'transform 0.15s', transform: expanded[section.id] ? 'rotate(0)' : 'rotate(-90deg)' }}>▼</span>}
                </button>
                {expanded[section.id] && section.children.map(child => (
                  <button key={child.id} onClick={() => setPage(child.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 16px 7px 36px', background: page === child.id ? 'var(--accent-soft)' : 'transparent', border: 'none', borderRight: page === child.id ? '2px solid var(--accent)' : '2px solid transparent', color: page === child.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 'var(--font-size-base)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: page === child.id ? 500 : 400 }}>
                    {t(child.labelKey, lang)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {page === 'appearance' && <AppearancePage config={local} onChange={handleChange} lang={lang} />}
            {page === 'lang' && <LangPage config={local} onChange={handleChange} lang={lang} />}
            {page === 'other' && <OtherPage config={local} onChange={handleChange} lang={lang} />}
            {page === 'api' && <ChatProvidersPage config={local} onChange={handleChange} onSetActive={({ baseUrl, model, savedChatModel }) => {
              setLocal(current => current ? ({
                ...current,
                savedChatModel: savedChatModel || current.savedChatModel || '',
                providers: {
                  ...current.providers,
                  chat: { ...(current.providers?.chat || {}), id: 'custom-chat', baseUrl, model: model || current.providers?.chat?.model || '' }
                }
              }) : current)
            }} lang={lang} />}
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, color: 'var(--danger)', fontSize: 12, minHeight: 18 }}>{saveError}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => { if (!saving) onClose() }} disabled={saving} style={{ ...btnS(false), opacity: saving ? 0.5 : 1 }}>{t('cancel', lang)}</button>
            <button onClick={handleSave} disabled={saving} style={{ ...btnS(true), opacity: saving ? 0.7 : 1 }}>{saving ? t('saving', lang) : t('save', lang)}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
