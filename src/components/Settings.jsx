import { useState, useEffect, useRef } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { t } from '../i18n'
import Ic from './icons'

const NAV_SECTIONS = [
  { id: 'general', labelKey: 'general', icon: 'gear', children: [
    { id: 'appearance', labelKey: 'appearance' },
    { id: 'lang', labelKey: 'language' },
    { id: 'other', labelKey: 'other' },
  ]},
  { id: 'api', labelKey: 'apiConfig', icon: 'link', children: [
    { id: 'chat', labelKey: 'chat' },
    { id: 'image', labelKey: 'image' },
    { id: 'video', labelKey: 'video' },
  ]},
]

const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2']
const STYLE_PRESETS = ['扁平插画', '3D 渲染', '写实摄影', '水彩画', '动漫风', '像素艺术', '油画', '极简主义', '赛博朋克', '剪纸']
const DURATIONS = ['5s', '8s', '10s']

/* ── reusable styles (all CSS variables) ── */
const labelS = () => ({ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--font-size-base)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' })
const inputS = () => ({ background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontFamily: 'var(--font-mono)', outline: 'none' })
const selectS = () => ({ ...inputS(), appearance: 'auto', cursor: 'pointer' })
const btnS = (primary) => ({ padding: '7px 20px', background: primary ? 'var(--accent)' : 'var(--bg-surface)', border: primary ? 'none' : '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: primary ? '#FFF' : 'var(--text-secondary)', fontSize: 'var(--font-size-base)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: primary ? 500 : 400 })

/* ── ProviderTab ── */
function ProviderTab({ track, providers, config, onChange, lang }) {
  const current = config?.providers?.[track] || {}
  const provider = providers.find(p => p.id === current.id)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [models, setModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fetchTimeout = useRef(null)

  const fetchModelList = async () => {
    if (!current.apiKey || !current.baseUrl) { setModels([]); return }
    setLoadingModels(true)
    try {
      const list = await window.electronAPI.fetchModels({ ...current, format: provider?.format })
      setModels(list || [])
      if (list?.length > 0 && !current.model) {
        onChange(track, { model: list[0].id })
      }
    } catch { setModels([]) }
    finally { setLoadingModels(false) }
  }

  useEffect(() => {
    if (current.apiKey && current.baseUrl) {
      clearTimeout(fetchTimeout.current)
      fetchTimeout.current = setTimeout(fetchModelList, 600)
    }
    return () => clearTimeout(fetchTimeout.current)
  }, [current.id, current.apiKey, current.baseUrl])

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const list = await window.electronAPI.fetchModels({ ...current, format: provider?.format })
      setModels(list || [])
      setTestResult(list.length > 0 ? { ok: true, count: list.length } : { ok: false, msg: t('testFail', lang) })
    } catch (e) { setTestResult({ ok: false, msg: e.message }) }
    finally { setTesting(false) }
  }

  const handleClear = () => {
    if (window.confirm(t('clearConfirm', lang))) {
      onChange(track, { apiKey: '', baseUrl: '', model: '' })
      setModels([])
      setTestResult(null)
    }
  }

  const handleRestoreUrl = () => {
    if (provider?.defaultUrl) onChange(track, { baseUrl: provider.defaultUrl })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelS()}>
        {t('provider', lang)}
        <select value={current.id || ''} onChange={e => { const p = providers.find(pp => pp.id === e.target.value); if (p) onChange(track, { id: p.id, baseUrl: p.defaultUrl, model: p.defaultModel }); setModels([]); setTestResult(null) }} style={selectS()}>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label style={labelS()}>
        {t('apiKey', lang)}
        <input type="password" value={current.apiKey || ''} placeholder="sk-..." onChange={e => onChange(track, { apiKey: e.target.value })} style={inputS()} />
      </label>
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
        <button onClick={handleTest} disabled={testing || !current.apiKey} style={{ ...btnS(false), opacity: !current.apiKey ? 0.4 : 1 }}>
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
function ImagePage({ config, onChange, lang }) {
  const g = config?.general || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProviderTab track="image" providers={IMG_PROVIDERS} config={config} onChange={(t2, patch) => onChange('image', patch)} lang={lang} />
      <label style={labelS()}>
        {t('defaultRatio', lang)}
        <select value={g.defaultRatio || '1:1'} onChange={e => onChange('general', { defaultRatio: e.target.value })} style={selectS()}>
          {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label style={labelS()}>
        {t('defaultStyle', lang)}
        <select value={g.defaultStyle || ''} onChange={e => onChange('general', { defaultStyle: e.target.value })} style={selectS()}>
          <option value="">{t('noStyle', lang)}</option>
          {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>
  )
}

/* ── Video settings page ── */
function VideoPage({ config, onChange, lang }) {
  const g = config?.general || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProviderTab track="video" providers={VID_PROVIDERS} config={config} onChange={(t2, patch) => onChange('video', patch)} lang={lang} />
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
export default function Settings({ config, onSave, onClose }) {
  const [page, setPage] = useState('appearance')
  const [local, setLocal] = useState(config)
  const [expanded, setExpanded] = useState({ general: true, api: true })
  useEffect(() => { if (config) setLocal(config) }, [config])

  const lang = local?.general?.language || 'zh'

  const handleChange = (track, patch) => {
    if (!local) return
    if (track === 'general') setLocal(prev => ({ ...prev, general: { ...prev.general, ...patch } }))
    else setLocal(prev => ({ ...prev, providers: { ...prev.providers, [track]: { ...prev.providers[track], ...patch } } }))
  }

  const handleSave = () => { if (local) { onSave(local); onClose() } }

  if (!local) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 680, maxHeight: '80vh', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: 'var(--font-body)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings', lang)}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}><Ic n="close" size={15} /></button>
        </div>
        {/* Body: sidebar + content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 170, borderRight: '1px solid var(--border-subtle)', padding: '12px 0', overflow: 'auto', flexShrink: 0 }}>
            {NAV_SECTIONS.map(section => (
              <div key={section.id}>
                <button onClick={() => setExpanded(prev => ({ ...prev, [section.id]: !prev[section.id] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 16px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                  <Ic n={section.icon} size={12} />
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
            {page === 'chat' && <ProviderTab track="chat" providers={CHAT_PROVIDERS} config={local} onChange={(t2, patch) => handleChange('chat', patch)} lang={lang} />}
            {page === 'image' && <ImagePage config={local} onChange={handleChange} lang={lang} />}
            {page === 'video' && <VideoPage config={local} onChange={handleChange} lang={lang} />}
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnS(false)}>{t('cancel', lang)}</button>
          <button onClick={handleSave} style={btnS(true)}>{t('save', lang)}</button>
        </div>
      </div>
    </div>
  )
}
