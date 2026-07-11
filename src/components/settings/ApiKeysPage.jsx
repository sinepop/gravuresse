import { useCallback, useEffect, useMemo, useState } from 'react'
import Ic from '../icons'
import {
  REDACTED_API_KEY, TRACKS, inputS, btnS, chipS,
  SectionHeading, providerDisplayName, billingLabel, localText,
  StatusBadge, LatencyBadge, ProviderLinkButtons, EmptyState
} from './shared.jsx'
import { providerInfo } from './settingsHelpers.js'

const CHINA_IDS = new Set(['alibaba', 'moonshot', 'zhipu', 'lingyi', 'siliconflow', 'volcengine', 'alibaba-wan', 'baidu-qianfan', 'tencent-tokenhub'])

function standardProviderIds(providerLists) {
  const ids = []
  const seen = new Set()
  for (const track of TRACKS) {
    for (const provider of providerLists?.[track] || []) {
      const id = String(provider?.id || '')
      const authType = typeof provider?.authType === 'string' ? provider.authType : provider?.authType?.type
      if (!id || seen.has(id) || id.startsWith('custom-') || authType === 'none') continue
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

function makeId(providerId, baseUrl) {
  const input = `${providerId}|${baseUrl || ''}|api-key`
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return `key-${(hash >>> 0).toString(36)}`
}

function providerEntry(providerLists, providerId) {
  for (const track of TRACKS) {
    const entry = (providerLists?.[track] || []).find?.(item => item.id === providerId)
    if (entry) return entry
  }
  return { id: providerId, name: providerId, chat: true }
}

function providerCapabilities(providerLists, providerId) {
  return TRACKS.filter(track => (providerLists?.[track] || []).some?.(item => item.id === providerId))
}

function validationFor(connection, track) {
  return connection?.validations?.[track] || null
}

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
          baseUrl: entry?.defaultUrl || '',
          authType: entry?.authType || { type: 'bearer' },
          capabilities,
          apiKey: key || REDACTED_API_KEY
        }
      })
      if (result?.modelsResult && result.modelsResult.ok !== true) setError(result.modelsResult.message || localText(lang, '模型拉取失败', 'Model discovery failed'))
      await onRefresh?.()
    } catch (err) {
      setError(err?.message || localText(lang, '保存失败', 'Save failed'))
    } finally { setSaving(false); onRequestEnd?.() }
  }, [draft, existing, lang, connectionId, providerId, displayName, entry, capabilities, onRefresh, onRequestStart, onRequestEnd])

  const validate = useCallback(async track => {
    if (!existing) return
    setBusyTrack(track); setError('')
    onRequestStart?.()
    try {
      const result = await window.electronAPI?.providerValidation?.run({ connectionId: existing.id, track })
      if (!result?.ok) setError(result?.message || localText(lang, '连接验证失败', 'Connection validation failed'))
      await onRefresh?.()
    } catch (err) { setError(err?.message || localText(lang, '验证失败', 'Validation failed')) }
    finally { setBusyTrack(''); onRequestEnd?.() }
  }, [existing, lang, onRefresh, onRequestStart, onRequestEnd])

  const refreshModels = useCallback(async track => {
    if (!existing) return
    setBusyTrack(track); setError('')
    onRequestStart?.()
    try {
      const result = await window.electronAPI?.providerModels?.refresh({ connectionId: existing.id, track })
      if (!result?.result?.ok) setError(result?.result?.message || localText(lang, '模型刷新失败', 'Model refresh failed'))
      await onRefresh?.()
    } catch (err) { setError(err?.message || localText(lang, '模型刷新失败', 'Model refresh failed')) }
    finally { setBusyTrack(''); onRequestEnd?.() }
  }, [existing, lang, onRefresh, onRequestStart, onRequestEnd])

  const remove = useCallback(async () => {
    if (!existing) return
    onRequestStart?.()
    try { await window.electronAPI?.providerConnection?.remove({ collection: 'apiKeys', id: existing.id }); await onRefresh?.() }
    catch (err) { setError(err?.message || localText(lang, '删除失败', 'Remove failed')) }
    finally { onRequestEnd?.() }
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
        {info.billing && <span style={chipS()}>{billingLabel(info.billing.mode, lang)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="password" value={draft} onChange={e => setDraft(e.target.value)} placeholder={existing ? REDACTED_API_KEY : localText(lang, '粘贴 API 密钥', 'Paste API key')} style={{ ...inputS(), flex: 1 }} />
        <button onClick={save} disabled={saving} style={{ ...btnS(true), opacity: saving ? 0.6 : 1 }}>{saving ? localText(lang, '保存中…', 'Saving…') : localText(lang, '保存并拉取', 'Save & Discover')}</button>
      </div>
      {existing && capabilities.map(track => { const trackValidation = validationFor(existing, track); return <div key={track} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={chipS()}>{track}</span>
        <StatusBadge status={trackValidation?.status || 'pending_configuration'} lang={lang} />
        <LatencyBadge latencyMs={trackValidation?.latencyMs} />
        <button onClick={() => refreshModels(track)} disabled={Boolean(busyTrack)} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11 }}>{busyTrack === track ? localText(lang, '处理中…', 'Working…') : localText(lang, '刷新模型', 'Refresh models')}</button>
        <button onClick={() => validate(track)} disabled={Boolean(busyTrack)} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11 }}>{busyTrack === track ? localText(lang, '验证中…', 'Validating…') : localText(lang, '真实测试连接', 'Test Connection')}</button>
        {trackValidation?.level && <span style={chipS()}>{trackValidation.level}</span>}
        {trackValidation?.checkedAt && <span style={chipS()}>{new Date(trackValidation.checkedAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')}</span>}
        {trackValidation?.endpointHost && <span style={chipS()}>{trackValidation.endpointHost}</span>}
      </div>})}
      {existing && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={remove} style={{ ...btnS(false), padding: '5px 10px', fontSize: 11, color: 'var(--danger)' }}><Ic n="trash" size={12} /> {localText(lang, '移除', 'Remove')}</button>
      </div>}
      {existing?.models?.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{existing.models.map(model => <span key={model.id} style={chipS('var(--accent)')}>{model.id}</span>)}</div>}
      {error && <div style={{ color: 'var(--danger)', fontSize: 11, lineHeight: 1.4 }}>{error}</div>}
      <ProviderLinkButtons links={info.links} lang={lang} buttons={[{ key: 'docs', icon: 'book', labelKey: 'linkDocs' }, { key: 'apiKey', icon: 'key', labelKey: 'linkGetKey' }, { key: 'pricing', icon: 'price', labelKey: 'linkPricing' }]} />
    </div>
  )
}

export default function ApiKeysPage({ providerLists, lang, onCanonicalChange, onBusyChange }) {
  const [connections, setConnections] = useState([])
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
      onCanonicalChange?.(result?.connections)
      setError('')
    } catch (err) { setError(err?.message || localText(lang, '无法读取提供商连接', 'Unable to load provider connections')) }
    finally { setLoading(false) }
  }, [lang, onCanonicalChange])
  useEffect(() => { refresh() }, [refresh])
  const providerIds = useMemo(() => standardProviderIds(providerLists), [providerLists])
  const china = providerIds.filter(id => CHINA_IDS.has(id))
  const global = providerIds.filter(id => !CHINA_IDS.has(id))
  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{localText(lang, '正在加载…', 'Loading…')}</div>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <SectionHeading labelKey="providerApiKeys" lang={lang} />
    {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
    {[['China Providers', china], ['Global Providers', global]].map(([title, ids]) => <section key={title}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{title} <span style={chipS()}>{ids.length}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,340px),1fr))', gap: 12 }}>{ids.map(id => <ApiKeyCard key={id} providerId={id} providerLists={providerLists} connections={connections} onRefresh={refresh} onRequestStart={onRequestStart} onRequestEnd={onRequestEnd} lang={lang} />)}</div>
    </section>)}
    {!providerIds.length && <EmptyState message={localText(lang, '暂无标准提供商', 'No standard providers')} />}
  </div>
}
