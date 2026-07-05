import { PROVIDER_ID_ALIASES } from '../providers/aliases.js'

export function canonicalProviderKey(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id || ''
}

export function currentMatchesProvider(track, current = {}, provider) {
  if (!provider || !current?.id) return false
  return canonicalProviderKey(track, current.id) === canonicalProviderKey(track, provider.id)
}

export function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

export function providerAuthConfig(provider = {}, current = {}) {
  const customType = normalizeAuthType(current.customAuth?.type)
  if (customType) return { ...(current.customAuth || {}), type: customType }
  const currentType = normalizeAuthType(current.authType?.type)
  if (currentType) return { ...(current.authType || {}), type: currentType }
  const providerType = normalizeAuthType(provider?.authType?.type)
  if (providerType) return { ...(provider.authType || {}), type: providerType }
  return { type: 'bearer' }
}

export function providerRequiresCredential(provider = {}, current = {}) {
  return providerAuthConfig(provider, current).type !== 'none'
}

export function providerUsesSession(provider = {}, current = {}) {
  return providerAuthConfig(provider, current).type === 'session'
}

export function providerCredentialReady(provider = {}, current = {}) {
  if (!providerRequiresCredential(provider, current)) return Boolean(provider?.id || current?.id)
  return providerUsesSession(provider, current) ? Boolean(current.sessionToken) : Boolean(current.apiKey)
}

export function isModelEndpointUnsupportedError(error) {
  const message = String(error?.message || '').toLowerCase()
  return /\b(404|405|501)\b/.test(message) ||
    message.includes('not found') ||
    message.includes('method not allowed') ||
    message.includes('not supported')
}

export function isProviderNetworkError(error) {
  const message = String(error?.message || error || '')
  return /\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b/i.test(message) ||
    /request timed out|connect timed out|socket hang up/i.test(message)
}

export function profileKey(track, profile = {}) {
  return [
    track,
    canonicalProviderKey(track, profile.providerId || profile.id),
    profile.baseUrl || '',
    profile.model || ''
  ].join('|')
}

export function profileMatchesProvider(track, profile = {}, provider) {
  if (!provider || !profile?.providerId) return false
  return canonicalProviderKey(track, profile.providerId) === canonicalProviderKey(track, provider.id)
}
