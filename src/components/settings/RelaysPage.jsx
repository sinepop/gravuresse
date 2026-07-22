// @ts-check

import { useCallback, useEffect, useState } from 'react'
import Ic from '../icons'
import { REDACTED_API_KEY, labelS, inputS, btnS, chipS, SectionHeading, localText, LatencyBadge, StatusBadge, validationEvidenceLabel } from './shared.jsx'

/** @typedef {import('../../types/domain').ProviderConnectionsConfig} ProviderConnectionsConfig */
/** @typedef {import('../../types/domain').ProviderValidationStatus} ProviderValidationStatus */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{ id: string, baseUrl: string, persistedBaseUrl: string, apiKey: string, hasCredential: boolean, detectedProtocol: string, detectedAt: string, detectedEndpoints: UnknownRecord | null, modelsCount: number, modelCounts: { chat: number, image: number, video: number }, validation: ProviderValidationStatus | null, cardError: string, diagnostic: string, diagnosticCopied: boolean }} RelayDraft */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) { return isRecord(value) ? value : {} }

/** @param {unknown} value @returns {string} */
function text(value) { return typeof value === 'string' ? value : '' }

/** @param {unknown} error @param {string} fallback */
function errorMessage(error, fallback) { return error instanceof Error ? error.message : fallback }

/** @param {unknown} value @returns {ProviderValidationStatus['evidence'] | undefined} */
function validationEvidence(value) {
  if (value === 'assistant_output' || value === 'protocol_response' || value === 'model_directory' || value === 'capability' || value === 'none') return value
  return undefined
}

/** @param {unknown} value @returns {ProviderValidationStatus | null} */
function validationOf(value) {
  if (!isRecord(value)) return null
  const evidence = validationEvidence(value.evidence)
  return {
    ok: value.ok === true,
    status: text(value.status),
    level: text(value.level),
    checkedAt: text(value.checkedAt),
    latencyMs: typeof value.latencyMs === 'number' ? value.latencyMs : null,
    endpointHost: text(value.endpointHost),
    modelId: text(value.modelId),
    errorCode: text(value.errorCode),
    message: text(value.message),
    error: text(value.error),
    ...(evidence ? { evidence } : {})
  }
}

/** @returns {RelayDraft} */
const EMPTY = () => ({
  id: `relay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  baseUrl: '',
  persistedBaseUrl: '',
  apiKey: '',
  hasCredential: false,
  detectedProtocol: '',
  detectedAt: '',
  detectedEndpoints: null,
  modelsCount: 0,
  modelCounts: { chat: 0, image: 0, video: 0 },
  validation: null,
  cardError: '',
  diagnostic: '',
  diagnosticCopied: false,
})

/** @param {unknown} value @returns {string} */
function endpointHost(value) {
  if (typeof value !== 'string' || !value) return ''
  try { return new URL(value).host } catch { return '' }
}

/** @param {unknown} endpoints @returns {string} */
function firstEndpointHost(endpoints) {
  if (!endpoints || typeof endpoints !== 'object') return ''
  for (const value of Object.values(endpoints)) {
    const host = endpointHost(value)
    if (host) return host
  }
  return ''
}

// Deliberately copy only renderer-editable fields and public detection metadata.
/** @param {unknown} item @returns {RelayDraft} */
export function normalizeRelay(item) {
  const input = recordOf(item)
  const validation = validationOf(input.validation || recordOf(input.validations).chat)
  const models = Array.isArray(input.models) ? input.models.filter(isRecord) : []
  return {
    ...EMPTY(),
    id: String(input.id || EMPTY().id),
    baseUrl: String(input.baseUrl || ''),
    persistedBaseUrl: String(input.baseUrl || ''),
    apiKey: '',
    hasCredential: input.apiKey === REDACTED_API_KEY || Boolean(input.hasCredential),
    detectedProtocol: String(input.detectedProtocol || ''),
    detectedAt: String(input.detectedAt || validation?.checkedAt || ''),
    detectedEndpoints: isRecord(input.detectedEndpoints) ? input.detectedEndpoints : null,
    modelsCount: models.length || Number(input.modelsCount || 0),
    modelCounts: {
      chat: models.filter(model => model.capability === 'chat').length,
      image: models.filter(model => model.capability === 'image').length,
      video: models.filter(model => model.capability === 'video').length
    },
    validation,
  }
}

/** @param {RelayDraft} relay @param {string} lang */
function relayName(relay, lang) {
  return endpointHost(relay.baseUrl) || localText(lang, '新中转', 'New relay')
}

/** @param {unknown} value @param {string} [secret=''] */
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

/** @param {unknown} failure @param {string} lang */
function relayFailureMessage(failure, lang) {
  const input = recordOf(failure)
  const protocolValue = text(input.protocol)
  const protocol = ['openai', 'anthropic', 'gemini'].includes(protocolValue)
    ? protocolValue[0].toUpperCase() + protocolValue.slice(1)
    : ''
  const stage = input.stage === 'directory'
    ? localText(lang, '模型目录', 'Model directory')
    : input.stage === 'inference'
      ? localText(lang, '最小推理', 'Minimal inference')
      : input.stage === 'normalize'
        ? localText(lang, '地址解析', 'URL normalization')
        : ''
  const status = Number.isInteger(input.statusCode) ? `HTTP ${input.statusCode}` : ''
  const path = /^\/[A-Za-z0-9._~!$&'()*+,;=:@{}/-]*$/.test(String(input.endpointPath || '')) ? text(input.endpointPath) : ''
  const message = text(input.message)
  return [protocol, stage, status, path, message].filter(Boolean).join(' · ')
}

/** @param {unknown} failure @param {RelayDraft} relay @param {string} [secret=''] */
export function relayFailureDiagnostic(failure, relay, secret = '') {
  const input = recordOf(failure)
  const reportedHost = text(input.endpointHost)
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(reportedHost) ? reportedHost : endpointHost(relay?.baseUrl)
  const reportedTime = text(input.checkedAt)
  return JSON.stringify({
    protocol: ['openai', 'anthropic', 'gemini'].includes(text(input.protocol)) ? text(input.protocol) : 'unknown',
    stage: input.stage === 'inference' ? 'inference' : input.stage === 'directory' ? 'directory' : 'unknown',
    statusCode: Number.isInteger(input.statusCode) ? input.statusCode : null,
    errorCode: redactDiagnosticText(input.errorCode || input.code || 'RELAY_CONNECTION_FAILED', secret),
    status: redactDiagnosticText(input.status || 'error', secret),
    endpointHost: safeHost || '',
    endpointPath: /^\/[A-Za-z0-9._~!$&'()*+,;=:@{}/-]*$/.test(String(input.endpointPath || '')) ? text(input.endpointPath) : '',
    checkedAt: /^\d{4}-\d{2}-\d{2}T/.test(reportedTime) ? reportedTime : new Date().toISOString(),
    latencyMs: typeof input.latencyMs === 'number' && Number.isFinite(input.latencyMs) ? input.latencyMs : null,
    message: redactDiagnosticText(input.message || 'Relay connection failed', secret),
  }, null, 2)
}

/** @param {{ relay: RelayDraft, lang: string }} props */
function RelaySummary({ relay, lang }) {
  const validation = relay.validation
  const host = validation?.endpointHost || firstEndpointHost(relay.detectedEndpoints) || endpointHost(relay.baseUrl)
  const checkedAt = validation?.checkedAt || relay.detectedAt
  const message = validation?.message || validation?.error
  const showSummary = relay.detectedProtocol || relay.modelsCount || validation
  if (!showSummary) return null

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {relay.detectedProtocol && <span style={chipS('var(--accent)')}>{relay.detectedProtocol}</span>}
      {validation && <StatusBadge status={validation.status || 'pending_configuration'} lang={lang} />}
      {validationEvidenceLabel(validation, lang) && <span style={chipS('var(--accent)')}>{validationEvidenceLabel(validation, lang)}</span>}
      <span style={chipS()}>{localText(lang, `${relay.modelsCount} 个模型`, `${relay.modelsCount} models`)}</span>
      {relay.modelCounts.chat > 0 && <span style={chipS()}>{localText(lang, `文本 ${relay.modelCounts.chat}`, `Text ${relay.modelCounts.chat}`)}</span>}
      {relay.modelCounts.image > 0 && <span style={chipS()}>{localText(lang, `图片 ${relay.modelCounts.image}`, `Image ${relay.modelCounts.image}`)}</span>}
      {relay.modelCounts.video > 0 && <span style={chipS()}>{localText(lang, `视频 ${relay.modelCounts.video}`, `Video ${relay.modelCounts.video}`)}</span>}
      <LatencyBadge latencyMs={validation?.latencyMs} />
      {validation?.level && <span style={chipS()}>{validation.level}</span>}
      {validation?.modelId && <span style={chipS()}>{validation.modelId}</span>}
      {host && <span style={chipS()}>{host}</span>}
      {checkedAt && <span style={chipS()}>{new Date(checkedAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')}</span>}
    </div>
    {message && validation?.status !== 'verified' && <div style={{ color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }}>{message}</div>}
  </div>
}

/** @param {{ relay: RelayDraft, onPatch: (changes: Partial<RelayDraft>) => void, onSave: () => unknown, onRemove: () => unknown, busy: boolean, busyAction: string, lang: string }} props */
function RelayCard({ relay, onPatch, onSave, onRemove, busy, busyAction, lang }) {
  const canReuseCredential = relay.hasCredential && relay.baseUrl.trim() === relay.persistedBaseUrl
  const hasKey = Boolean(relay.apiKey) || canReuseCredential
  const canSave = Boolean(relay.baseUrl.trim()) && hasKey && !busy
  return <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{relayName(relay, lang)}</span>
    </div>
    <label style={labelS()}>Base URL
      <input value={relay.baseUrl} onChange={event => onPatch({ baseUrl: event.target.value, cardError: '', diagnostic: '', diagnosticCopied: false })} disabled={busy} placeholder="https://relay.example.com" autoComplete="url" spellCheck={false} style={inputS()} />
    </label>
    <label style={labelS()}>API Key
      <input type="password" value={relay.apiKey} onChange={event => onPatch({ apiKey: event.target.value, cardError: '', diagnostic: '', diagnosticCopied: false })} disabled={busy} placeholder={relay.hasCredential ? REDACTED_API_KEY : localText(lang, '粘贴 API Key', 'Paste API Key')} autoComplete="off" spellCheck={false} style={inputS()} />
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
        {busyAction === 'save' ? localText(lang, '连接中…', 'Connecting…') : localText(lang, '连接并拉取模型', 'Connect & discover models')}
      </button>
      <button onClick={onRemove} disabled={busy} style={{ ...btnS(false), color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Ic n="trash" size={13} /> {localText(lang, '删除', 'Delete')}
      </button>
    </div>
  </div>
}

/** @param {{ lang: string, onCanonicalChange?: (connections: ProviderConnectionsConfig) => void, onBusyChange?: (busy: boolean) => void }} props */
export default function RelaysPage({ lang, onCanonicalChange, onBusyChange }) {
  const [relays, setRelays] = useState(/** @type {RelayDraft[]} */ ([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  useEffect(() => {
    onBusyChange?.(loading || Boolean(busyId))
    return () => onBusyChange?.(false)
  }, [loading, busyId, onBusyChange])

  const refresh = useCallback(async () => {
    try {
      const result = await window.electronAPI?.providerConnection?.list()
      setRelays((result?.connections?.relays || []).map(normalizeRelay))
      if (result?.connections) onCanonicalChange?.(result.connections)
      setError('')
    } catch (/** @type {unknown} */ err) {
      setError(errorMessage(err, localText(lang, '读取失败', 'Load failed')))
    } finally {
      setLoading(false)
    }
  }, [lang, onCanonicalChange])

  useEffect(() => { refresh() }, [refresh])

  /** @param {string} id @param {Partial<RelayDraft>} changes */
  const patch = (id, changes) => setRelays(current => current.map(item => item.id === id ? { ...item, ...changes } : item))

  /** @param {RelayDraft} relay */
  const save = async relay => {
    setBusyId(relay.id)
    setBusyAction('save')
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
    } catch (/** @type {unknown} */ err) {
      const error = recordOf(err)
      const failure = {
        errorCode: text(error.errorCode) || text(error.code) || 'NETWORK_ERROR',
        status: text(error.status) || 'error',
        endpointHost: endpointHost(relay.baseUrl),
        message: text(error.message) || errorMessage(err, localText(lang, '连接失败', 'Connection failed')),
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
      setBusyAction('')
    }
  }

  /** @param {RelayDraft} relay */
  const remove = async relay => {
    if (!window.confirm(localText(lang, '确定删除此中转？', 'Delete this relay?'))) return
    setBusyId(relay.id)
    setBusyAction('remove')
    try {
      await window.electronAPI?.providerConnection?.remove({ collection: 'relays', id: relay.id })
      await refresh()
    } catch (/** @type {unknown} */ err) {
      setError(errorMessage(err, localText(lang, '删除失败', 'Delete failed')))
    } finally { setBusyId(''); setBusyAction('') }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{localText(lang, '正在加载…', 'Loading…')}</div>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <SectionHeading labelKey="providerGateways" lang={lang} />
    {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
    {relays.map(relay => <RelayCard key={relay.id} relay={relay} onPatch={changes => patch(relay.id, changes)} onSave={() => save(relay)} onRemove={() => remove(relay)} busy={busyId === relay.id} busyAction={busyId === relay.id ? busyAction : ''} lang={lang} />)}
    <button onClick={() => setRelays(current => [...current, EMPTY()])} style={{ ...btnS(true), alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Ic n="plus" size={13} /> {localText(lang, '添加中转', 'Add relay')}
    </button>
  </div>
}
