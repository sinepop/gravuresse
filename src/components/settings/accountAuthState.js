// @ts-check

/** @typedef {import('../../types/electron-api').ProviderConnectorStatus} ProviderConnectorStatus */
/** @typedef {import('../../types/electron-api').ProviderAuthAttempt} ProviderAuthAttempt */
/** @typedef {ProviderConnectorStatus & Partial<ProviderAuthAttempt>} AuthConnectorView */

/** @type {Set<string>} */
export const ACTIVE_AUTH_STATUSES = new Set(['pending', 'exchanging'])
/** @type {Set<string>} */
export const TERMINAL_AUTH_STATUSES = new Set(['verified', 'error', 'expired', 'cancelled', 'connected_unverified', 'authenticated_unavailable'])

/** @param {unknown} value @returns {string} */
export function safeAuthorizationUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

/** @param {AuthConnectorView} connector @param {ProviderAuthAttempt | ProviderConnectorStatus | null | undefined} attempt @returns {AuthConnectorView} */
export function mergeAuthAttempt(connector, attempt) {
  return {
    ...connector,
    ...attempt,
    id: connector.id,
    attemptId: attempt?.id || connector.attemptId || ''
  }
}

/** @param {AuthConnectorView} connector */
export function shouldPollAuth(connector) {
  return Boolean(connector?.attemptId && ACTIVE_AUTH_STATUSES.has(connector.status))
}

/** @param {ProviderConnectorStatus} connector */
export function canBeginAuth(connector) {
  return Boolean(connector?.mode !== 'cli' && connector?.registrationAvailable === true && connector?.status === 'available')
}

/** @param {unknown} status */
export function isTerminalAuthStatus(status) {
  if (typeof status !== 'string') return false
  return TERMINAL_AUTH_STATUSES.has(status)
}

/** @param {Partial<ProviderAuthAttempt> | ProviderConnectorStatus | null | undefined} connector */
export function authExternalUrl(connector) {
  return safeAuthorizationUrl(connector?.authorizationUrl || connector?.verificationUri || '')
}

/** @param {unknown} expiresAt @param {number} [now=Date.now()] @returns {number | null} */
export function authSecondsRemaining(expiresAt, now = Date.now()) {
  if (typeof expiresAt !== 'string') return null
  const expiry = Date.parse(expiresAt || '')
  if (!Number.isFinite(expiry)) return null
  return Math.max(0, Math.ceil((expiry - now) / 1000))
}

/** @param {unknown} seconds @returns {string} */
export function formatAuthCountdown(seconds) {
  if (!Number.isFinite(seconds)) return ''
  if (typeof seconds !== 'number') return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.max(0, seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
