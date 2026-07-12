// @ts-check

import { useCallback, useEffect, useMemo, useState } from 'react'
import Ic from '../icons'
import {
  REDACTED_API_KEY, TRACKS, inputS, btnS, chipS,
  SectionHeading, providerDisplayName, billingLabel, localText,
  regionLabel, validationEvidenceLabel,
  StatusBadge, LatencyBadge, ProviderLinkButtons, EmptyState
} from './shared.jsx'
import { providerInfo } from './settingsHelpers.js'

/** @typedef {import('../../types/domain').ProviderConnection} ProviderConnection */
/** @typedef {import('../../types/domain').ProviderConnectionsConfig} ProviderConnectionsConfig */
/** @typedef {import('../../types/domain').ProviderLists} ProviderLists */
/** @typedef {import('../../types/domain').ProviderProfile} ProviderProfile */
/** @typedef {import('../../types/domain').ProviderValidationStatus} ProviderValidationStatus */
/** @typedef {import('../../types/domain').Track} Track */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

/** @param {unknown} error @param {string} fallback */
function errorMessage(error, fallback) { return error instanceof Error ? error.message : fallback }

/** @param {unknown} value @returns {NonNullable<ProviderConnection['authType']>} */
function connectionAuthType(value) {
  if (typeof value === 'string') return { type: value }
  const input = isRecord(value) ? value : {}
  return {
    type: typeof input.type === 'string' ? input.type : 'bearer',
    ...(typeof input.headerName === 'string' ? { headerName: input.headerName } : {}),
    ...(typeof input.paramName === 'string' ? { paramName: input.paramName } : {}),
    ...(typeof input.key === 'string' ? { key: input.key } : {})
  }
}

/** @param {ProviderLists} providerLists @returns {string[]} */
function standardProviderIds(providerLists) {
  const ids = []
  const seen = new Set()
  for (const track of TRACKS) {
    for (const provider of providerLists?.[track] || []) {
      const id = String(provider?.id || '')
      const authType = typeof provider?.authType === 'string' ? provider.authType : isRecord(provider?.authType) ? provider.authType.type : ''
      if (!id || seen.has(id) || id.startsWith('custom-') || authType === 'none') continue
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** @param {string} providerId @param {unknown} baseUrl */
function makeId(providerId, baseUrl) {
  const input = `${providerId}|${baseUrl || ''}|api-key`
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return `key-${(hash >>> 0).toString(36)}`
}

/** @param {ProviderLists} providerLists @param {string} providerId @returns {ProviderProfile} */
function providerEntry(providerLists, providerId) {
  for (const track of TRACKS) {
    const entry = (providerLists?.[track] || []).find?.(item => item.id === providerId)
    if (entry) return entry
  }
  return { id: providerId, name: providerId, chat: true }
}

/** @param {ProviderLists} providerLists @param {string} providerId @returns {Track[]} */
function providerCapabilities(providerLists, providerId) {
  return TRACKS.filter(track => (providerLists?.[track] || []).some?.(item => item.id === providerId))
}

/** @param {ProviderConnection | null} connection @param {Track} track @returns {ProviderValidationStatus | null} */
function validationFor(connection, track) {
  return connection?.validations?.[track] || null
}

/** @param {{ providerId: string, providerLists: ProviderLists, connections: ProviderConnection[], onRefresh?: () => unknown | Promise<unknown>, onRequestStart?: () => void, onRequestEnd?: () => void, lang: string }} props */
function ApiKeyCard({ providerId, providerLists, connections, onRefresh, onRequestStart, onRequestEnd, lang }) {
  const entry = useMemo(() => providerEntry(providerLists, providerId), [providerLists, providerId])
  const displayName = providerDisplayName(entry, lang, 'chat') || providerId
  const info = providerInfo(entry)
  const capabilities = useMemo(() => providerCapabilities(providerLists, providerId), [providerLists, providerId])
  const existing = connections.find(item => item.providerId === providerId) || null
  const connectionId = existing?.id || makeId(providerId, entry?.defaultUrl)
  const validation = capabilities.map(track => validationFor(existing, track)).find(Boolean) || null
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyTrack, setBusyTrack] = useState('')
  const [error, setError] = useState('')
  const cardBusy = saving || Boolean(busyTrack)

  const save = useCallback(async () => {
    const key = draft.trim()
    if (!key && !existing) { setError(localText(lang, '请输入 API 密钥', 'Enter an API key')); return }
    setSaving(true); setError('')
    onRequestStart?.()
    setDraft('')
    try {
      const result = await window.electronAPI?.providerConnection?.save({
        collection: 'apiKeys',
        connection: {
          id: connectionId,
          providerId,
          name: displayName,
          kind: 'api-key',
          baseUrl: entry?.defaultUrl || '',
          authType: connectionAuthType(entry?.authType),
          capabilities,
          apiKey: key || REDACTED_API_KEY
        }
      })
      const failed = Object.values(result?.modelsResults || {}).find(item => item?.ok !== true) || (result?.modelsResult?.ok !== true ? result?.modelsResult : null)
      if (failed) setError(failed.message || localText(lang, '模型拉取失败', 'Model discovery failed'))
      await onRefresh?.()
    } catch (/** @type {unknown} */ err) {
      setError(errorMessage(err, localText(lang, '保存失败', 'Save failed')))
    } finally { setSaving(false); onRequestEnd?.() }
  }, [draft, existing, lang, connectionId, providerId, displayName, entry, capabilities, onRefresh, onRequestStart, onRequestEnd])

  const refreshModels = useCallback(/** @param {Track} track */ async track => {
    if (!existing) return
    setBusyTrack(track); setError('')
    onRequestStart?.()
    try {
      const result = await window.electronAPI?.providerModels?.refresh({ connectionId: existing.id, track })
      if (!result?.result?.ok) setError(result?.result?.message || localText(lang, '模型刷新失败', 'Model refresh failed'))
      await onRefresh?.()
    } catch (/** @type {unknown} */ err) { setError(errorMessage(err, localText(lang, '模型刷新失败', 'Model refresh failed'))) }
    finally { setBusyTrack(''); onRequestEnd?.() }
  }, [existing, lang, onRefresh, onRequestStart, onRequestEnd])

  const remove = useCallback(async () => {
    if (!existing) return
    setBusyTrack('remove'); setError('')
    onRequestStart?.()
    try { await window.electronAPI?.providerConnection?.remove({ collection: 'apiKeys', id: existing.id }); await onRefresh?.() }
    catch (/** @type {unknown} */ err) { setError(errorMessage(err, localText(lang, '删除失败', 'Remove failed'))) }
    finally { setBusyTrack(''); onRequestEnd?.() }
  }, [existing, lang, onRefresh, onRequestStart, onRequestEnd])

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</span>
        <StatusBadge status={validation?.status || (existing ? 'pending_configuration' : 'not_detected')} lang={lang} />
        <LatencyBadge latencyMs={validation?.latencyMs} />
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {capabilities.map(track => <span key={track} style={chipS()}>{track}</span>)}
        <span style={chipS()}>{regionLabel(info.region, lang)}</span>
        {info.billing && <span style={chipS()}>{billingLabel(info.billing.mode, lang)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="password" value={draft} onChange={e => setDraft(e.target.value)} disabled={cardBusy} placeholder={existing ? REDACTED_API_KEY : localText(lang, '粘贴 API 密钥', 'Paste API key')} style={{ ...inputS(), flex: 1 }} />
        <button onClick={save} disabled={cardBusy} style={{ ...btnS(true), opacity: cardBusy ? 0.6 : 1 }}>{saving ? localText(lang, '保存中…', 'Saving…') : localText(lang, '保存并拉取', 'Save & Discover')}</button>
      </div>
      {existing && capabilities.map(track => { const trackValidation = validationFor(existing, track); return <div key={track} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={chipS()}>{track}</span>
        <StatusBadge status={trackValidation?.status || 'pending_configuration'} lang={lang} />
        <LatencyBadge latencyMs={trackValidation?.latencyMs} />
        {validationEvidenceLabel(trackValidation, lang) && <span style={chipS('var(--accent)')}>{validationEvidenceLabel(trackValidation, lang)}</span>}
        <button onClick={() => refreshModels(track)} disabled={cardBusy} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11 }}>{busyTrack === track ? localText(lang, '处理中…', 'Working…') : localText(lang, '刷新模型', 'Refresh models')}</button>
        {trackValidation?.level && <span style={chipS()}>{trackValidation.level}</span>}
        {trackValidation?.checkedAt && <span style={chipS()}>{new Date(trackValidation.checkedAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')}</span>}
        {trackValidation?.endpointHost && <span style={chipS()}>{trackValidation.endpointHost}</span>}
        {trackValidation?.ok === false && <div style={{ flexBasis: '100%', color: 'var(--danger)', fontSize: 11, lineHeight: 1.4 }}>{trackValidation.errorCode && <strong>{trackValidation.errorCode}: </strong>}{trackValidation.message}</div>}
      </div>})}
      {existing && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={remove} disabled={cardBusy} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11, color: 'var(--danger)', opacity: cardBusy ? 0.55 : 1 }}><Ic n="trash" size={12} /> {localText(lang, '移除', 'Remove')}</button>
      </div>}
      {existing && (existing.models?.length || 0) > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(existing.models || []).map(model => <span key={model.id} style={chipS('var(--accent)')}>{model.id}</span>)}</div>}
      {error && <div style={{ color: 'var(--danger)', fontSize: 11, lineHeight: 1.4 }}>{error}</div>}
      <ProviderLinkButtons links={info.links} lang={lang} buttons={[{ key: 'docs', icon: 'book', labelKey: 'linkDocs' }, { key: 'apiKey', icon: 'key', labelKey: 'linkGetKey' }, { key: 'pricing', icon: 'price', labelKey: 'linkPricing' }]} />
    </div>
  )
}

/** @param {{ providerLists: ProviderLists, lang: string, onCanonicalChange?: (connections: ProviderConnectionsConfig) => void, onBusyChange?: (busy: boolean) => void }} props */
export default function ApiKeysPage({ providerLists, lang, onCanonicalChange, onBusyChange }) {
  const [connections, setConnections] = useState(/** @type {ProviderConnection[]} */ ([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingRequests, setPendingRequests] = useState(0)
  useEffect(() => {
    onBusyChange?.(loading || pendingRequests > 0)
    return () => onBusyChange?.(false)
  }, [loading, pendingRequests, onBusyChange])
  const onRequestStart = useCallback(() => setPendingRequests(count => count + 1), [])
  const onRequestEnd = useCallback(() => setPendingRequests(count => Math.max(0, count - 1)), [])
  const refresh = useCallback(async () => {
    try {
      const result = await window.electronAPI?.providerConnection?.list()
      setConnections(result?.connections?.apiKeys || [])
      if (result?.connections) onCanonicalChange?.(result.connections)
      setError('')
    } catch (/** @type {unknown} */ err) { setError(errorMessage(err, localText(lang, '无法读取提供商连接', 'Unable to load provider connections'))) }
    finally { setLoading(false) }
  }, [lang, onCanonicalChange])
  useEffect(() => { refresh() }, [refresh])
  const providerIds = useMemo(() => {
    const configured = new Set(connections.map(item => item.providerId))
    return standardProviderIds(providerLists).sort((left, right) => {
      const configuredOrder = Number(configured.has(right)) - Number(configured.has(left))
      if (configuredOrder) return configuredOrder
      const leftName = providerDisplayName(providerEntry(providerLists, left), lang, 'chat') || left
      const rightName = providerDisplayName(providerEntry(providerLists, right), lang, 'chat') || right
      return leftName.localeCompare(rightName, lang === 'en' ? 'en' : 'zh-CN')
    })
  }, [connections, providerLists, lang])
  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{localText(lang, '正在加载…', 'Loading…')}</div>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <SectionHeading labelKey="providerApiKeys" lang={lang} />
    {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,340px),1fr))', gap: 12 }}>{providerIds.map(id => <ApiKeyCard key={id} providerId={id} providerLists={providerLists} connections={connections} onRefresh={refresh} onRequestStart={onRequestStart} onRequestEnd={onRequestEnd} lang={lang} />)}</div>
    {!providerIds.length && <EmptyState message={localText(lang, '暂无标准提供商', 'No standard providers')} />}
  </div>
}
