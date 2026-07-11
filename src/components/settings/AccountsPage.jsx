import { useCallback, useEffect, useState } from 'react'
import Ic from '../icons'
import { btnS, chipS, SectionHeading, StatusBadge, LatencyBadge, localText } from './shared.jsx'
import {
  authExternalUrl,
  authSecondsRemaining,
  canBeginAuth,
  formatAuthCountdown,
  isTerminalAuthStatus,
  mergeAuthAttempt,
  shouldPollAuth
} from './accountAuthState.js'

function authorizationModeLabel(mode, lang) {
  if (mode === 'device_code') return localText(lang, '设备码', 'Device code')
  if (mode === 'browser_oauth') return localText(lang, '浏览器 OAuth', 'Browser OAuth')
  if (mode === 'local_detection') return localText(lang, '本机检测', 'Local detection')
  return mode || ''
}

function ConnectorCard({ connector, onConnect, onCancel, onOpen, onRefresh, onDisconnect, lang }) {
  const [copied, setCopied] = useState(false)
  const canConnect = canBeginAuth(connector)
  const canReverify = connector.mode === 'cli' || Boolean(connector.connectionId && connector.runtimeAvailable)
  const canDisconnect = connector.mode !== 'cli' && Boolean(connector.connectionId)
  const externalUrl = authExternalUrl(connector)
  const secondsRemaining = authSecondsRemaining(connector.expiresAt)
  const activeAttempt = shouldPollAuth(connector)
  const copyCode = async () => {
    if (!connector.userCode) return
    await navigator.clipboard.writeText(connector.userCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{connector.name}</span>
      {connector.authorizationMode && <span style={chipS()}>{authorizationModeLabel(connector.authorizationMode, lang)}</span>}
      <StatusBadge status={connector.status} lang={lang} />
      <LatencyBadge latencyMs={connector.latencyMs} />
    </div>
    {connector.endpointHost && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{connector.endpointHost}</div>}
    {(connector.level || connector.checkedAt) && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {connector.level && <span style={chipS()}>{connector.level}</span>}
      {connector.checkedAt && <span style={chipS()}>{new Date(connector.checkedAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')}</span>}
    </div>}
    {connector.userCode && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: 'var(--text-primary)', fontSize: 12 }}>
      <span>{localText(lang, '设备码', 'Device code')}</span>
      <code style={{ ...chipS('var(--accent)'), fontSize: 14, letterSpacing: 2 }}>{connector.userCode}</code>
      <button onClick={copyCode} style={{ ...btnS(false), fontSize: 11 }}>{copied ? localText(lang, '已复制', 'Copied') : localText(lang, '复制', 'Copy')}</button>
    </div>}
    {activeAttempt && secondsRemaining !== null && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
      {localText(lang, '授权剩余时间', 'Authorization expires in')} {formatAuthCountdown(secondsRemaining)}
    </div>}
    {connector.message && <div style={{ color: connector.status === 'error' ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 12, lineHeight: 1.4 }}>{connector.message}</div>}
    {connector.status === 'registration_required' && <div style={{ color: '#f59e0b', fontSize: 11 }}>
      {localText(lang, '需要 Gravuresse 自有 OAuth 客户端注册信息；不会复用 Hermes 或其他第三方客户端身份。', 'A Gravuresse-owned OAuth client registration is required; Hermes and other third-party client identities are not reused.')}
    </div>}
    {connector.status === 'authenticated_unavailable' && <div style={{ color: '#f59e0b', fontSize: 11 }}>
      {localText(lang, '官网认证已完成，但该连接器尚无可执行的运行时映射，暂不能用于生成。', 'Official authentication completed, but this connector has no executable runtime mapping and cannot generate yet.')}
    </div>}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {canConnect && <button onClick={() => onConnect(connector)} style={{ ...btnS(true), fontSize: 11 }}><Ic n="link" size={12} /> {localText(lang, '连接官网账号', 'Connect official account')}</button>}
      {activeAttempt && externalUrl && <button onClick={() => onOpen(connector)} style={{ ...btnS(false), fontSize: 11 }}><Ic n="link" size={12} /> {localText(lang, '重新打开认证页', 'Reopen authorization page')}</button>}
      {activeAttempt && <button onClick={() => onCancel(connector)} style={{ ...btnS(false), fontSize: 11 }}>{localText(lang, '取消授权', 'Cancel authorization')}</button>}
      {canReverify && <button onClick={() => onRefresh(connector)} style={{ ...btnS(false), fontSize: 11 }}><Ic n="refresh" size={12} /> {localText(lang, '重新验证', 'Re-verify')}</button>}
      {canDisconnect && <button onClick={() => onDisconnect(connector)} style={{ ...btnS(false), color: 'var(--danger)', fontSize: 11 }}>{localText(lang, '断开', 'Disconnect')}</button>}
    </div>
  </div>
}

export default function AccountsPage({ lang = 'zh', onCanonicalChange, onBusyChange }) {
  const [connectors, setConnectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingRequests, setPendingRequests] = useState(0)
  useEffect(() => {
    onBusyChange?.(loading || pendingRequests > 0)
    return () => onBusyChange?.(false)
  }, [loading, pendingRequests, onBusyChange])
  const withBusy = useCallback(async operation => {
    setPendingRequests(count => count + 1)
    try { return await operation() } finally { setPendingRequests(count => Math.max(0, count - 1)) }
  }, [])
  const load = useCallback(async () => {
    try {
      const [result, connectionList] = await Promise.all([window.electronAPI?.providerAuth?.status(), window.electronAPI?.providerConnection?.list()])
      setConnectors(Array.isArray(result) ? result : [])
      onCanonicalChange?.(connectionList?.connections)
      setError('')
    } catch (err) {
      setError(err?.message || localText(lang, '读取账号状态失败', 'Failed to load account status'))
    } finally {
      setLoading(false)
    }
  }, [lang, onCanonicalChange])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const active = connectors.filter(shouldPollAuth)
    if (!active.length) return undefined
    const timer = window.setInterval(async () => {
      for (const connector of active) {
        try {
          const result = await window.electronAPI?.providerAuth?.status({ attemptId: connector.attemptId })
          if (!result) continue
          if (isTerminalAuthStatus(result.status)) await load()
          else setConnectors(prev => prev.map(item => item.id === connector.id ? mergeAuthAttempt(item, result) : item))
        } catch (err) {
          setError(err?.message || localText(lang, '授权状态读取失败', 'Failed to read authorization status'))
        }
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [connectors, lang, load])

  const openAuthorization = async connector => {
    return withBusy(async () => { try {
      const url = authExternalUrl(connector)
      if (!url) throw new Error(localText(lang, '认证地址无效', 'Invalid authorization URL'))
      await window.electronAPI?.openExternal?.(url)
    } catch (err) {
      setError(err?.message || localText(lang, '无法打开认证页', 'Failed to open authorization page'))
    } })
  }
  const begin = async connector => {
    return withBusy(async () => { setError('')
    try {
      const result = await window.electronAPI?.providerAuth?.begin({ connectorId: connector.id })
      if (result) setConnectors(prev => prev.map(item => item.id === connector.id ? mergeAuthAttempt(item, result) : item))
      const external = authExternalUrl(result)
      if (external) await window.electronAPI?.openExternal?.(external)
      if (result?.status === 'error' || result?.status === 'unavailable' || result?.status === 'registration_required') setError(result.message || localText(lang, '连接失败', 'Connection failed'))
    } catch (err) {
      setError(err?.message || localText(lang, '连接失败', 'Connection failed'))
    } })
  }
  const cancel = async connector => withBusy(async () => { try { await window.electronAPI?.providerAuth?.cancel({ attemptId: connector.attemptId }); await load() } catch (err) { setError(err?.message || localText(lang, '取消失败', 'Cancel failed')) } })
  const reverify = async connector => withBusy(async () => { setError(''); try { if (connector.mode === 'cli' || !connector.connectionId) { await load(); return } const result = await window.electronAPI?.providerValidation?.run({ connectionId: connector.connectionId, track: 'chat' }); if (!result?.ok) setError(result?.message || localText(lang, '验证失败', 'Validation failed')); await load() } catch (err) { setError(err?.message || localText(lang, '验证失败', 'Validation failed')) } })
  const disconnect = async connector => withBusy(async () => { try { await window.electronAPI?.providerAuth?.disconnect({ connectorId: connector.id }); await load() } catch (err) { setError(err?.message || localText(lang, '断开失败', 'Disconnect failed')) } })

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{localText(lang, '正在加载…', 'Loading…')}</div>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <SectionHeading labelKey="providerAccounts" lang={lang} />
    {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
    {connectors.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{localText(lang, '暂无可用账号连接器', 'No account connectors available')}</div>}
    {connectors.map(connector => <ConnectorCard key={connector.id} connector={connector} onConnect={begin} onCancel={cancel} onOpen={openAuthorization} onRefresh={reverify} onDisconnect={disconnect} lang={lang} />)}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--success-soft)', border: '1px solid var(--success)', color: 'var(--success)', fontSize: 12, lineHeight: 1.4 }}><Ic n="check" size={14} />{localText(lang, '令牌只保存在 Electron 主进程，渲染进程不会读取令牌内容。', 'Tokens remain in the Electron main process and are never exposed to the renderer.')}</div>
  </div>
}
