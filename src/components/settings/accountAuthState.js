export const ACTIVE_AUTH_STATUSES = new Set(['pending', 'exchanging'])
export const TERMINAL_AUTH_STATUSES = new Set(['verified', 'error', 'expired', 'cancelled', 'connected_unverified', 'authenticated_unavailable'])

export function safeAuthorizationUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

export function mergeAuthAttempt(connector, attempt) {
  return {
    ...connector,
    ...attempt,
    id: connector.id,
    attemptId: attempt?.id || connector.attemptId || ''
  }
}

export function shouldPollAuth(connector) {
  return Boolean(connector?.attemptId && ACTIVE_AUTH_STATUSES.has(connector.status))
}

export function canBeginAuth(connector) {
  return Boolean(connector?.mode !== 'cli' && connector?.registrationAvailable === true && connector?.status === 'available')
}

export function isTerminalAuthStatus(status) {
  return TERMINAL_AUTH_STATUSES.has(status)
}

export function authExternalUrl(connector) {
  return safeAuthorizationUrl(connector?.authorizationUrl || connector?.verificationUri || '')
}

export function authSecondsRemaining(expiresAt, now = Date.now()) {
  const expiry = Date.parse(expiresAt || '')
  if (!Number.isFinite(expiry)) return null
  return Math.max(0, Math.ceil((expiry - now) / 1000))
}

export function formatAuthCountdown(seconds) {
  if (!Number.isFinite(seconds)) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.max(0, seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
