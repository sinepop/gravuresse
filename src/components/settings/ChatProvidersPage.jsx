// @ts-check

import { useState } from 'react'
import { t } from '../../i18n'
import Ic from '../icons'
import { btnS, inputS, labelS, localText } from './settingsUi.js'

/** @typedef {import('../../types/domain').ConfigPayload} ConfigPayload */
/** @typedef {import('../../types/domain').ProviderProfile} ProviderProfile */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {(section: string, patch: unknown) => void} SettingsChange */
/** @typedef {{ ok: boolean, count?: number, msg?: string }} FetchResult */
/** @typedef {{ ok: boolean, latency?: number, msg?: string }} ConnectionResult */

const REDACTED_API_KEY = '********'

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

/** @param {{ config: ConfigPayload, onChange: SettingsChange, onSetActive?: (selection: { baseUrl: string, model: string, savedChatModel: string }) => void, lang: string }} props */
export default function ChatProvidersPage({ config, onChange, onSetActive, lang }) {
  const providers = Array.isArray(config.chatProviders) ? config.chatProviders : []
  const activeChat = config.providers?.chat || {}
  const activeSavedModel = config.savedChatModel || ''

  /** @param {number} index @param {UnknownRecord} patch */
  const updateProvider = (index, patch) => {
    onChange('chatProviders', providers.map((provider, itemIndex) => itemIndex === index ? { ...provider, ...patch } : provider))
  }

  const addProvider = () => {
    onChange('chatProviders', [...providers, {
      name: '', baseUrl: '', apiKey: '', defaultModel: '', models: [], enabled: true
    }])
  }

  /** @param {number} index */
  const deleteProvider = (index) => {
    if (!window.confirm(t('deleteProviderConfirm', lang))) return
    onChange('chatProviders', providers.filter((_, itemIndex) => itemIndex !== index))
  }

  /** @param {ProviderProfile} provider */
  const setActive = (provider) => {
    if (!provider.baseUrl) return
    onSetActive?.({
      baseUrl: provider.baseUrl,
      model: provider.defaultModel || '',
      savedChatModel: provider.defaultModel || ''
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{t('chatProviders', lang)}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{t('chatProvidersDesc', lang)}</div>
      {providers.map((provider, index) => (
        <ChatProviderCard
          key={index}
          provider={provider}
          index={index}
          lang={lang}
          isActive={Boolean(provider.baseUrl && activeChat.baseUrl === provider.baseUrl && activeSavedModel === (provider.defaultModel || ''))}
          onUpdate={updateProvider}
          onDelete={deleteProvider}
          onSetActive={() => setActive(provider)}
        />
      ))}
      <button onClick={addProvider} style={{ ...btnS(false), padding: '8px 16px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
        <Ic n="plus" size={12} /> {t('addProvider', lang)}
      </button>
    </div>
  )
}

/** @param {{ provider: ProviderProfile, index: number, lang: string, isActive?: boolean, onUpdate: (index: number, patch: UnknownRecord) => void, onDelete: (index: number) => void, onSetActive?: () => void }} props */
function ChatProviderCard({ provider, index, lang, onUpdate, onDelete }) {
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState(/** @type {FetchResult | null} */ (null))
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(/** @type {ConnectionResult | null} */ (null))
  const [showApiKey, setShowApiKey] = useState(false)

  /** @param {UnknownRecord} partial */
  const patch = (partial) => onUpdate(index, partial)

  const handleFetchModels = async () => {
    if (!provider.baseUrl || !provider.apiKey) return
    setFetching(true)
    setFetchResult(null)
    try {
      const result = await window.electronAPI?.providerAPI?.fetchModels?.({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.defaultModel,
        name: provider.name,
        providerIndex: index
      })
      if (!result || result.ok === false) throw new Error(result?.message || 'Failed')
      const list = Array.isArray(result) ? result : result.models || []
      patch({ models: list.map(model => typeof model === 'string' ? model : text(recordOf(model).id) || text(recordOf(model).model) || String(model)) })
      setFetchResult({ ok: true, count: list.length })
    } catch (error) {
      setFetchResult({ ok: false, msg: error instanceof Error ? error.message : 'Failed' })
    } finally {
      setFetching(false)
    }
  }

  const handleTestConnection = async () => {
    if (!provider.baseUrl || !provider.apiKey) return
    setTesting(true)
    setTestResult(null)
    const start = Date.now()
    try {
      const result = await window.electronAPI?.providerAPI?.testConnection?.({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.defaultModel || provider.models?.[0],
        name: provider.name,
        providerIndex: index
      })
      setTestResult({ ok: result?.ok !== false, latency: Date.now() - start, msg: result?.message })
    } catch (error) {
      setTestResult({ ok: false, msg: error instanceof Error ? error.message : 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  /** @param {string} modelToRemove */
  const handleRemoveModel = (modelToRemove) => {
    patch({ models: (provider.models || []).filter(model => model !== modelToRemove) })
  }

  /** @param {React.KeyboardEvent<HTMLInputElement>} event */
  const handleAddModel = (event) => {
    if (event.key !== 'Enter' || !event.currentTarget.value.trim()) return
    const newModel = event.currentTarget.value.trim()
    const current = provider.models || []
    if (!current.includes(newModel)) patch({ models: [...current, newModel] })
    event.currentTarget.value = ''
  }

  const canCall = Boolean(provider.baseUrl && provider.apiKey)
  return (
    <div style={{ border: `1px solid ${provider.enabled === false ? 'var(--border-subtle)' : 'var(--border-accent)'}`, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, opacity: provider.enabled === false ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Ic n="chat" size={14} />
        <input type="text" value={provider.name || ''} placeholder={localText(lang, '供应商名称', 'Provider name')} onChange={event => patch({ name: event.target.value })} style={{ ...inputS(), flex: 1, fontWeight: 600 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={provider.enabled !== false} onChange={event => patch({ enabled: event.target.checked })} />
          {t('enable', lang)}
        </label>
        <button onClick={() => onDelete(index)} title={t('deleteProvider', lang)} style={{ ...btnS(false), padding: '6px 8px', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
          <Ic n="trash" size={12} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={labelS()}>
          {t('baseUrl', lang)}
          <input type="text" value={provider.baseUrl || ''} placeholder="https://api.example.com/v1" onChange={event => patch({ baseUrl: event.target.value })} style={inputS()} />
        </label>
        <label style={labelS()}>
          {t('apiKey', lang)}
          <div style={{ display: 'flex', gap: 6 }}>
            <input type={showApiKey ? 'text' : 'password'} value={provider.apiKey === REDACTED_API_KEY ? '' : provider.apiKey || ''} placeholder={provider.apiKey === REDACTED_API_KEY ? t('configuredPlaceholder', lang) : 'sk-...'} onChange={event => patch({ apiKey: event.target.value })} style={{ ...inputS(), flex: 1 }} />
            <button onClick={() => setShowApiKey(!showApiKey)} style={{ ...btnS(false), padding: 8, flexShrink: 0 }} title={showApiKey ? 'Hide' : 'Show'}>
              <Ic n="eye" size={12} />
            </button>
          </div>
        </label>
      </div>

      <label style={labelS()}>
        {t('defaultModel', lang)}
        <input type="text" value={provider.defaultModel || ''} placeholder={localText(lang, '默认模型名', 'e.g. gpt-4o')} onChange={event => patch({ defaultModel: event.target.value })} style={{ ...inputS(), fontFamily: 'var(--font-mono)' }} />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('model', lang)}</span>
          <button onClick={handleFetchModels} disabled={fetching || !canCall} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11, opacity: canCall ? 1 : 0.4 }}>
            {fetching ? '...' : <><Ic n="refresh" size={10} /> {t('fetchModels', lang)}</>}
          </button>
          <button onClick={handleTestConnection} disabled={testing || !canCall} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11, opacity: canCall ? 1 : 0.4 }}>
            {testing ? t('testing', lang) : <><Ic n="zap" size={10} /> {t('connectTest', lang)}</>}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {(provider.models || []).map(model => (
            <span key={model} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {model}
              <button onClick={() => handleRemoveModel(model)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}><Ic n="close" size={10} /></button>
            </span>
          ))}
          <input type="text" placeholder="+" onKeyDown={handleAddModel} style={{ ...inputS(), width: 60, padding: '3px 6px', fontSize: 11 }} />
        </div>
        {fetchResult && <span style={{ fontSize: 11, color: fetchResult.ok ? 'var(--success)' : 'var(--danger)' }}>{fetchResult.ok ? `✓ ${fetchResult.count} ${t('modelsLoaded', lang)}` : `✗ ${fetchResult.msg}`}</span>}
        {testResult && <span style={{ fontSize: 11, color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}>{testResult.ok ? `✓ ${t('connectionReady', lang)} (${testResult.latency}ms)` : `✗ ${testResult.msg || t('testFail', lang)}`}</span>}
      </div>
    </div>
  )
}
