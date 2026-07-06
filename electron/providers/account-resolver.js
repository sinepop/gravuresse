const { getProvider } = require('./registry')

const PROVIDER_ID_ALIASES = {
  chat: { claude: 'anthropic', gemini: 'google', qwen: 'alibaba', kimi: 'moonshot', doubao: 'volcengine' },
  image: { dalle: 'openai', gemini_img: 'google', jimeng_img: 'volcengine' },
  video: { jimeng_vid: 'volcengine' }
}

function cleanEndpoint(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function resolveProviderIdByTrack(track, id) {
  return (PROVIDER_ID_ALIASES[track] || {})[id] || id
}

function defaultProviderBaseUrl(providerId) {
  const def = getProvider(providerId)
  return def?.defaults?.baseUrl || ''
}

function sameStoredProviderProfile(track, provider = {}, profile = {}) {
  const providerId = resolveProviderIdByTrack(track, provider.providerId || provider.id)
  const profileId = resolveProviderIdByTrack(track, profile.providerId || profile.id)
  if (!providerId || providerId !== profileId) return false
  if (provider.baseUrl && (provider.baseUrl || '') !== (profile.baseUrl || '')) return false
  if (provider.model && (provider.model || '') !== (profile.model || '')) return false
  return true
}

function findStoredProviderProfile(stored = {}, track, provider = {}) {
  const profile = (stored.providerProfiles?.[track] || []).find(item => sameStoredProviderProfile(track, provider, item))
  if (!profile) return null
  return {
    ...profile,
    id: profile.providerId || profile.id,
    baseUrl: profile.baseUrl || '',
    model: profile.model || ''
  }
}

function findStoredProviderAccount(stored = {}, accountId, track = '') {
  if (!accountId) return null
  const account = (stored.providerAccounts || []).find(item => item.accountId === accountId)
  if (!account || account.kind === 'oauth-placeholder') return null
  if (Array.isArray(account.tracks) && account.tracks.length > 0 && track && !account.tracks.includes(track)) return null
  return {
    ...account,
    id: account.providerId || account.id,
    baseUrl: account.baseUrl || '',
    modelListPath: account.modelListPath || account.modelsPath || ''
  }
}

function mergeStoredProviderAccount(provider = {}, account = {}) {
  if (!account) return provider
  return {
    ...provider,
    id: account.providerId || account.id || provider.id,
    accountId: account.accountId,
    accountKind: account.kind || provider.accountKind,
    apiKey: account.apiKey || provider.apiKey || '',
    sessionToken: account.sessionToken || provider.sessionToken || '',
    baseUrl: account.baseUrl || provider.baseUrl || '',
    authType: account.authType || provider.authType,
    customAuth: account.customAuth || provider.customAuth,
    pathPrefix: account.pathPrefix || provider.pathPrefix,
    modelListPath: account.modelListPath || account.modelsPath || provider.modelListPath || provider.modelsPath,
    protocol: account.protocol || provider.protocol,
    format: account.format || provider.format,
    template: account.template || provider.template
  }
}

function storedProviderForRequest(stored = {}, track, provider = {}) {
  const requestedAccount = findStoredProviderAccount(stored, provider.accountId, track)
  if (requestedAccount) return mergeStoredProviderAccount(provider, requestedAccount)
  const activeProvider = stored.providers?.[track] || {}
  const activeAccount = findStoredProviderAccount(stored, activeProvider.accountId, track)
  const effectiveActiveProvider = mergeStoredProviderAccount(activeProvider, activeAccount)
  const requestedId = resolveProviderIdByTrack(track, provider.providerId || provider.id || activeProvider.id)
  const activeId = resolveProviderIdByTrack(track, effectiveActiveProvider.id)
  const activeMatches =
    (!requestedId || requestedId === activeId) &&
    (!provider.baseUrl || (provider.baseUrl || '') === (effectiveActiveProvider.baseUrl || '')) &&
    (!provider.model || (provider.model || '') === (effectiveActiveProvider.model || ''))
  if (activeMatches) return effectiveActiveProvider
  const profile = findStoredProviderProfile(stored, track, { providerId: requestedId, baseUrl: provider.baseUrl, model: provider.model }) || {}
  return mergeStoredProviderAccount(profile, findStoredProviderAccount(stored, profile.accountId, track))
}

function canUseStoredCredentials(track, candidate = {}, storedProvider = {}) {
  const candidateId = candidate.id || candidate.providerId || storedProvider.id
  const canonicalId = resolveProviderIdByTrack(track, candidateId)
  if (!canonicalId || canonicalId !== resolveProviderIdByTrack(track, storedProvider.id)) return false
  const candidateUrl = cleanEndpoint(candidate.baseUrl || defaultProviderBaseUrl(canonicalId))
  const allowedUrl = cleanEndpoint(storedProvider.baseUrl || defaultProviderBaseUrl(canonicalId))
  return Boolean(candidateUrl && allowedUrl && candidateUrl === allowedUrl)
}

module.exports = {
  canUseStoredCredentials,
  findStoredProviderAccount,
  findStoredProviderProfile,
  mergeStoredProviderAccount,
  resolveProviderIdByTrack,
  sameStoredProviderProfile,
  storedProviderForRequest
}
