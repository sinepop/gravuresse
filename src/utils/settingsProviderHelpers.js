// @ts-check

import { PROVIDER_ID_ALIASES } from '../providers/aliases.js'

/** @typedef {Record<string, unknown>} UnknownRecord */

/**
 * @param {unknown} value
 * @returns {value is UnknownRecord}
 */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/**
 * @param {unknown} value
 * @returns {UnknownRecord}
 */
function recordOf(value) {
  return isRecord(value) ? value : {}
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * @param {unknown} track
 * @param {unknown} id
 * @returns {string}
 */
export function canonicalProviderKey(track, id) {
  const value = text(id)
  if (track !== 'chat' && track !== 'image' && track !== 'video') return value
  return PROVIDER_ID_ALIASES[track][value] || value
}

/**
 * @param {unknown} track
 * @param {unknown} current
 * @param {unknown} provider
 */
export function currentMatchesProvider(track, current = {}, provider) {
  const currentRecord = recordOf(current)
  const providerRecord = recordOf(provider)
  if (!provider || !text(currentRecord.id)) return false
  return canonicalProviderKey(track, currentRecord.id) === canonicalProviderKey(track, providerRecord.id)
}

/** @param {unknown} type */
export function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

/**
 * @param {unknown} provider
 * @param {unknown} current
 * @returns {UnknownRecord & { type: string }}
 */
export function providerAuthConfig(provider = {}, current = {}) {
  const currentRecord = recordOf(current)
  const providerRecord = recordOf(provider)
  const customAuth = recordOf(currentRecord.customAuth)
  const currentAuth = recordOf(currentRecord.authType)
  const providerAuth = recordOf(providerRecord.authType)
  const customType = normalizeAuthType(customAuth.type)
  if (customType) return { ...customAuth, type: customType }
  const currentType = normalizeAuthType(currentAuth.type)
  if (currentType) return { ...currentAuth, type: currentType }
  const providerType = normalizeAuthType(providerAuth.type)
  if (providerType) return { ...providerAuth, type: providerType }
  return { type: 'bearer' }
}

/** @param {unknown} provider @param {unknown} current */
export function providerRequiresCredential(provider = {}, current = {}) {
  return providerAuthConfig(provider, current).type !== 'none'
}

/** @param {unknown} provider @param {unknown} current */
export function providerUsesSession(provider = {}, current = {}) {
  return providerAuthConfig(provider, current).type === 'session'
}

/** @param {unknown} provider @param {unknown} current */
export function providerCredentialReady(provider = {}, current = {}) {
  const providerRecord = recordOf(provider)
  const currentRecord = recordOf(current)
  if (!providerRequiresCredential(providerRecord, currentRecord)) return Boolean(text(providerRecord.id) || text(currentRecord.id))
  if (text(currentRecord.accountId) && currentRecord.accountKind !== 'oauth-placeholder') return true
  return providerUsesSession(providerRecord, currentRecord) ? Boolean(text(currentRecord.sessionToken)) : Boolean(text(currentRecord.apiKey))
}

/** @param {unknown} error */
export function isModelEndpointUnsupportedError(error) {
  const record = recordOf(error)
  const message = text(record.message).toLowerCase()
  return /\b(404|405|501)\b/.test(message) ||
    message.includes('not found') ||
    message.includes('method not allowed') ||
    message.includes('not supported')
}

/** @param {unknown} error */
export function isProviderNetworkError(error) {
  const record = recordOf(error)
  const message = text(record.message) || text(error)
  return /\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b/i.test(message) ||
    /\b(502|503|504)\b/.test(message) ||
    /request timed out|connect timed out|socket hang up/i.test(message)
}

/** @param {unknown} track @param {unknown} profile */
export function profileKey(track, profile = {}) {
  const record = recordOf(profile)
  return [
    text(track),
    canonicalProviderKey(track, text(record.providerId) || text(record.id)),
    text(record.baseUrl),
    text(record.model)
  ].join('|')
}

/** @param {unknown} track @param {unknown} profile @param {unknown} provider */
export function profileMatchesProvider(track, profile = {}, provider) {
  const profileRecord = recordOf(profile)
  const providerRecord = recordOf(provider)
  if (!provider || !text(profileRecord.providerId)) return false
  return canonicalProviderKey(track, profileRecord.providerId) === canonicalProviderKey(track, providerRecord.id)
}
