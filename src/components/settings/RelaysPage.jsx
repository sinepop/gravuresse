import { useCallback, useEffect, useState } from 'react'
import Ic from '../icons'
import { REDACTED_API_KEY, labelS, inputS, btnS, chipS, SectionHeading, localText, LatencyBadge } from './shared.jsx'

const EMPTY = () => ({
  id: `relay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  baseUrl: '',
  apiKey: '',
  hasCredential: false,
  detectedProtocol: '',
  detectedAt: '',
  detectedEndpoints: null,
  modelsCount: 0,
  validation: null,
  cardError: '',
  diagnostic: '',
  diagnosticCopied: false,
})

function endpointHost(value) {
  if (!value) return ''
  try { return new URL(value).host } catch { return '' }
}

function firstEndpointHost(endpoints) {
  if (!endpoints || typeof endpoints !== 'object') return ''
  for (const value of Object.values(endpoints)) {
    const host = endpointHost(value)
    if (host) return host
  }
  return ''
}

// Deliberately copy only renderer-editable fields and public detection metadata.
export function normalizeRelay(item) {
  const validation = item?.validation || item?.validations?.chat || null
  return {
    ...EMPTY(),
    id: String(item?.id || EMPTY().id),
    baseUrl: String(item?.baseUrl || ''),
    apiKey: '',
    hasCredential: item?.apiKey === REDACTED_API_KEY || Boolean(item?.hasCredential),
    detectedProtocol: String(item?.detectedProtocol || ''),
    detectedAt: String(item?.detectedAt || validation?.checkedAt || ''),
    detectedEndpoints: item?.detectedEndpoints && typeof item.detectedEndpoints === 'object' ? item.detectedEndpoints : null,
    modelsCount: Array.isArray(item?.models) ? item.models.length : Number(item?.modelsCount || 0),
    validation,
  }
}

function relayName(relay, lang) {
  return endpointHost(relay.baseUrl) || localText(lang, '新中转', 'New relay')
}

function redactDiagnosticText(value, secret = '') {
  let text = String(value || '')
  if (secret && secret !== REDACTED_API_KEY) text = text.split(secret).join('[REDACTED]')
  return text
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:api[_-]?key|key|token)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_ -]?key|token|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z]:\\[^\r\n"']+/g, '[LOCAL_PATH]')
    .replace(/file:\/\/\/[^\s"']+/gi, '[LOCAL_PATH]')
}

function relayFailureMessage(failure, lang) {
  const protocol = ['openai', 'anthropic', 'gemini'].includes(failure?.protocol)
    ? failure.protocol[0].toUpperCase() + failure.protocol.slice(1)
    : ''
  const stage = failure?.stage === 'directory'
    ? localText(lang, '模型目录', 'Model directory')
    : failure?.stage === 'inference'
      ? localText(lang, '最小推理', 'Minimal inference')
      : failure?.stage === 'normalize'
        ? localText(lang, '地址解析', 'URL normalization')
        : ''
  const status = Number.isInteger(failure?.statusCode) ? `HTTP ${failure.statusCode}` : ''
  const path = /^\/[A-Za-z0-9._~!$&'()*+,;=:@{}/-]*$/.test(String(failure?.endpointPath || '')) ? failure.endpointPath : ''
  const parts = [protocol, stage, status, path].filter(Boolean)
  return parts.length ? parts.join(' · ') : String(failure?.message || '')
}

export function relayFailureDiagnostic(failure, relay, secret = '') {
  const reportedHost = String(failure?.endpointHost || '')
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(reportedHost) ? reportedHost : endpointHost(relay?.baseUrl)
  const reportedTime = String(failure?.checkedAt || '')
  return JSON.stringify({
    protocol: ['openai', 'anthropic', 'gemini'].includes(failure?.protocol) ? failure.protocol : 'unknown',
    stage: failure?.stage === 'inference' ? 'inference' : failure?.stage === 'directory' ? 'directory' : 'unknown',
    statusCode: Number.isInteger(failure?.statusCode) ? failure.statusCode : null,
    errorCode: redactDiagnosticText(failure?.errorCode || failure?.code || 'RELAY_CONNECTION_FAILED', secret),
    status: redactDiagnosticText(failure?.status || 'error', secret),
    endpointHost: safeHost || '',
    endpointPath: /^\/[A-Za-z0-9._~!$&'()*+,;=:@{}/-]*$/.test(String(failure?.endpointPath || '')) ? failure.endpointPath : '',
    checkedAt: /^\d{4}-\d{2}-\d{2}T/.test(reportedTime) ? reportedTime : new Date().toISOString(),
    latencyMs: Number.isFinite(failure?.latencyMs) ? failure.latencyMs : null,
    message: redactDiagnosticText(failure?.message || 'Relay connection failed', secret),
  }, null, 2)
}

function RelaySummary({ relay, lang }) {
  const validation = relay.validation
  const host = validation?.endpointHost || firstEndpointHost(relay.detectedEndpoints) || endpointHost(relay.baseUrl)
  const checkedAt = relay.detectedAt || validation?.checkedAt
  const message = validation?.message || validation?.error
  const showSummary = relay.detectedProtocol || relay.modelsCount || validation
  if (!showSummary) return null

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {relay.detectedProtocol && <span style={chipS('var(--accent)')}>{relay.detectedProtocol}</span>}
      <span style={chipS()}>{localText(lang, `${relay.modelsCount} 个模型`, `${relay.modelsCount} models`)}</span>
      <LatencyBadge latencyMs={validation?.latencyMs} />
      {host && <span style={chipS()}>{host}</span>}
      {checkedAt && <span style={chipS()}>{new Date(checkedAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')}</span>}
    </div>
    {message && validation?.status !== 'verified' && <div style={{ color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }}>{message}</div>}
  </div>
}

function RelayCard({ relay, onPatch, onSave, onRemove, busy, lang }) {
  const hasKey = Boolean(relay.apiKey) || relay.hasCredential
  const canSave = Boolean(relay.baseUrl.trim()) && hasKey && !busy
  return <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{relayName(relay, lang)}</span>
    </div>
    <label style={labelS()}>Base URL
      <input value={relay.baseUrl} onChange={event => onPatch({ baseUrl: event.target.value, cardError: '', diagnostic: '', diagnosticCopied: false })} placeholder="https://relay.example.com" autoComplete="url" spellCheck={false} style={inputS()} />
    </label>
    <label style={labelS()}>API Key
      <input type="password" value={relay.apiKey} onChange={event => onPatch({ apiKey: event.target.value, cardError: '', diagnostic: '', diagnosticCopied: false })} placeholder={relay.hasCredential ? REDACTED_API_KEY : localText(lang, '粘贴 API Key', 'Paste API Key')} autoComplete="off" spellCheck={false} style={inputS()} />
    </label>
    <RelaySummary relay={relay} lang={lang} />
    {relay.cardError && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', background: 'var(--danger-soft)' }}>
      <div style={{ color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }}>{relay.cardError}</div>
      {relay.diagnostic && <button type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(relay.diagnostic)
          onPatch({ diagnosticCopied: true })
        } catch {
          onPatch({ diagnosticCopied: false })
        }
      }} style={{ ...btnS(false), alignSelf: 'flex-start', padding: '6px 10px' }}>
        {relay.diagnosticCopied ? localText(lang, '已复制诊断', 'Diagnostic copied') : localText(lang, '复制脱敏诊断', 'Copy redacted diagnostic')}
      </button>}
    </div>}
    <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
      <button onClick={onSave} disabled={!canSave} style={{ ...btnS(true), opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {busy ? localText(lang, '连接中…', 'Connecting…') : localText(lang, '连接并拉取模型', 'Connect & discover models')}
      </button>
      <button onClick={onRemove} disabled={busy} style={{ ...btnS(false), color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Ic n="trash" size={13} /> {localText(lang, '删除', 'Delete')}
      </button>
    </div>
  </div>
}

export default function RelaysPage({ lang, onCanonicalChange, onBusyChange }) {
  const [relays, setRelays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  useEffect(() => {
    onBusyChange?.(loading || Boolean(busyId))
    return () => onBusyChange?.(false)
  }, [loading, busyId, onBusyChange])

  const refresh = useCallback(async () => {
    try {
      const result = await window.electronAPI?.providerConnection?.list()
      setRelays((result?.connections?.relays || []).map(normalizeRelay))
      onCanonicalChange?.(result?.connections)
      setError('')
    } catch (err) {
      setError(err?.message || localText(lang, '读取失败', 'Load failed'))
    } finally {
      setLoading(false)
    }
  }, [lang, onCanonicalChange])

  useEffect(() => { refresh() }, [refresh])

  const patch = (id, changes) => setRelays(current => current.map(item => item.id === id ? { ...item, ...changes } : item))

  const save = async relay => {
    setBusyId(relay.id)
    const credential = relay.apiKey || REDACTED_API_KEY
    patch(relay.id, { apiKey: '', cardError: '', diagnostic: '', diagnosticCopied: false })
    try {
      const result = await window.electronAPI?.providerConnection?.save({
        collection: 'relays',
        connection: { id: relay.id, baseUrl: relay.baseUrl.trim(), apiKey: credential },
      })
      const outcome = result?.detectionResult || result?.modelsResult
      if (outcome?.ok !== true) {
        const failure = outcome || { errorCode: 'EMPTY_RESPONSE', status: 'error', message: localText(lang, '连接未返回可验证结果', 'The connection returned no verifiable result') }
        const safeMessage = redactDiagnosticText(relayFailureMessage(failure, lang) || failure.message || localText(lang, '连接或模型拉取失败', 'Connection or model discovery failed'), credential)
        patch(relay.id, {
          cardError: safeMessage,
          diagnostic: relayFailureDiagnostic(failure, relay, credential),
          diagnosticCopied: false,
        })
        return
      }
      await refresh()
    } catch (err) {
      const failure = {
        errorCode: err?.errorCode || err?.code || 'NETWORK_ERROR',
        status: err?.status || 'error',
        endpointHost: endpointHost(relay.baseUrl),
        message: err?.message || localText(lang, '连接失败', 'Connection failed'),
      }
      const safeMessage = redactDiagnosticText(failure.message, credential)
      patch(relay.id, {
        hasCredential: relay.hasCredential,
        cardError: safeMessage,
        diagnostic: relayFailureDiagnostic(failure, relay, credential),
        diagnosticCopied: false,
      })
    } finally {
      setBusyId('')
    }
  }

  const remove = async relay => {
    if (!window.confirm(localText(lang, '确定删除此中转？', 'Delete this relay?'))) return
    setBusyId(relay.id)
    try {
      await window.electronAPI?.providerConnection?.remove({ collection: 'relays', id: relay.id })
      await refresh()
    } catch (err) {
      setError(err?.message || localText(lang, '删除失败', 'Delete failed'))
    } finally { setBusyId('') }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{localText(lang, '正在加载…', 'Loading…')}</div>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <SectionHeading labelKey="providerGateways" lang={lang} />
    {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
    {relays.map(relay => <RelayCard key={relay.id} relay={relay} onPatch={changes => patch(relay.id, changes)} onSave={() => save(relay)} onRemove={() => remove(relay)} busy={busyId === relay.id} lang={lang} />)}
    <button onClick={() => setRelays(current => [...current, EMPTY()])} style={{ ...btnS(true), alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Ic n="plus" size={13} /> {localText(lang, '添加中转', 'Add relay')}
    </button>
  </div>
}
