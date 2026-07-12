// @ts-check

/** @typedef {import('../types/domain').Track} Track */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {UnknownRecord & { accountId: string, kind: string, providerId: string, name: string, apiKey: string, sessionToken: string, baseUrl: string, modelListPath: string, pathPrefix: string, authType: unknown, customAuth: UnknownRecord, protocol: unknown, format: unknown, template: UnknownRecord, tracks: Track[], status: string }} ProviderAccount */

/** @type {Track[]} */
const TRACKS = ['chat', 'image', 'video']
const SECRET_REDACTED = '********'

export const OPENAI_COMPATIBLE_GATEWAY_PRESETS = [
  { id: 'openai-compatible', label: 'OpenAI-compatible', name: 'OpenAI-compatible Relay' },
  { id: 'newapi', label: 'New API / One API', name: 'New API / One API Relay' },
  { id: 'sub2api', label: 'sub2api', name: 'sub2api Relay' },
  { id: 'cpa-compatible', label: 'CPA compatible', name: 'CPA compatible Relay' }
]

/** @param {string} value */
function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** @param {unknown} value @returns {value is UnknownRecord} */
function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) {
  return isPlainObject(value) ? value : {}
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {unknown} value @returns {value is Track} */
function isTrack(value) {
  return value === 'chat' || value === 'image' || value === 'video'
}

/** @param {unknown} type */
function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

/** @param {unknown} account */
function accountProviderId(account = {}) {
  const record = recordOf(account)
  return text(record.providerId) || text(record.id)
}

/** @param {unknown} account */
function accountBaseUrl(account = {}) {
  return text(recordOf(account).baseUrl).trim().replace(/\/+$/, '')
}

/** @param {unknown} account */
function accountAuthSignature(account = {}) {
  const record = recordOf(account)
  const customAuth = recordOf(record.customAuth)
  const authType = recordOf(record.authType)
  const customType = normalizeAuthType(customAuth.type)
  const type = customType || normalizeAuthType(authType.type || record.authType)
  const key = text(customAuth.headerName) || text(customAuth.paramName) || text(customAuth.sessionHeaderName) || text(customAuth.key) || text(authType.key)
  return [type || 'bearer', key].join(':')
}

/** @param {unknown} account */
export function providerAccountKey(account = {}) {
  const record = recordOf(account)
  return [
    text(record.kind) || 'api-key',
    accountProviderId(record),
    accountBaseUrl(record),
    accountAuthSignature(record)
  ].join('|')
}

/** @param {unknown} account */
export function makeProviderAccountId(account = {}) {
  return `acct_${hashString(providerAccountKey(account))}`
}

/** @param {unknown} presetId */
export function providerGatewayPresetPatch(presetId = 'openai-compatible') {
  const preset = OPENAI_COMPATIBLE_GATEWAY_PRESETS.find(item => item.id === text(presetId)) || OPENAI_COMPATIBLE_GATEWAY_PRESETS[0]
  return {
    kind: 'gateway',
    providerId: 'openai',
    name: preset.name,
    authType: { type: 'bearer' },
    customAuth: {},
    modelListPath: '/v1/models',
    template: {
      path: '/v1/images/generations',
      method: 'POST',
      pollPath: '/v1/images/tasks/{taskId}',
      pollMethod: 'GET',
      taskIdPath: 'data.task_id',
      statusPath: 'data.status',
      imageUrlPath: 'data[0].url'
    },
    tracks: ['chat', 'image']
  }
}

/**
 * @param {unknown} account
 * @param {unknown} providerDef
 * @returns {ProviderAccount}
 */
export function normalizeProviderAccount(account = {}, providerDef = {}) {
  const source = recordOf(account)
  const definition = recordOf(providerDef)
  const defaults = recordOf(definition.defaults)
  const providerId = accountProviderId(source) || text(definition.id)
  const kind = text(source.kind) || (source.oauthPlaceholder === true ? 'oauth-placeholder' : providerId === 'openai-compatible-relay' ? 'gateway' : 'api-key')
  const baseUrl = text(source.baseUrl) || text(definition.defaultUrl) || text(defaults.baseUrl)
  /** @type {ProviderAccount} */
  const normalized = {
    accountId: text(source.accountId) || makeProviderAccountId({ ...source, kind, providerId, baseUrl }),
    kind,
    providerId,
    name: text(source.name) || text(definition.name) || providerId,
    apiKey: text(source.apiKey),
    sessionToken: text(source.sessionToken),
    baseUrl,
    modelListPath: text(source.modelListPath) || text(source.modelsPath) || text(definition.modelListPath) || text(definition.modelsPath),
    pathPrefix: text(source.pathPrefix) || text(definition.pathPrefix),
    authType: source.authType || definition.authType,
    customAuth: recordOf(source.customAuth),
    protocol: source.protocol || definition.protocol,
    format: source.format || definition.format,
    template: recordOf(source.template),
    tracks: Array.isArray(source.tracks) ? source.tracks.filter(isTrack) : [],
    status: text(source.status) || (kind === 'oauth-placeholder' ? 'placeholder' : '')
  }
  normalized.accountId = text(source.accountId) || makeProviderAccountId(normalized)
  return normalized
}

/**
 * @param {unknown} providerMap
 * @param {Track} track
 * @param {string} providerId
 * @returns {UnknownRecord}
 */
function providerForTrack(providerMap = {}, track, providerId) {
  const items = recordOf(providerMap)[track]
  return (Array.isArray(items) ? items : []).map(recordOf).find(provider => text(provider.id) === providerId) || {}
}

/** @param {unknown} providerMap @param {string} providerId */
function providerDefForAnyTrack(providerMap = {}, providerId) {
  for (const track of TRACKS) {
    const provider = providerForTrack(providerMap, track, providerId)
    if (provider?.id) return provider
  }
  return {}
}

/** @param {unknown} source */
function credentialPresent(source = {}) {
  const record = recordOf(source)
  return Boolean(
    (text(record.apiKey) && record.apiKey !== SECRET_REDACTED) ||
    (text(record.sessionToken) && record.sessionToken !== SECRET_REDACTED)
  )
}

/**
 * @param {Track} track
 * @param {unknown} source
 * @param {unknown} providerMap
 * @param {string} kind
 * @returns {ProviderAccount | null}
 */
function accountFromProvider(track, source = {}, providerMap = {}, kind = 'api-key') {
  const record = recordOf(source)
  const providerId = text(record.providerId) || text(record.id)
  if (!providerId) return null
  const providerDef = providerForTrack(providerMap, track, providerId)
  return normalizeProviderAccount({
    accountId: text(record.accountId),
    kind: text(record.accountKind) || text(record.kind) || kind,
    providerId,
    name: text(record.name) || text(providerDef.name) || providerId,
    apiKey: text(record.apiKey),
    sessionToken: text(record.sessionToken),
    baseUrl: text(record.baseUrl) || text(providerDef.defaultUrl),
    modelListPath: text(record.modelListPath) || text(record.modelsPath),
    pathPrefix: text(record.pathPrefix),
    authType: record.authType || providerDef.authType,
    customAuth: recordOf(record.customAuth),
    protocol: record.protocol || providerDef.protocol,
    format: record.format || providerDef.format,
    template: recordOf(record.template || record.customTemplate),
    tracks: [track]
  }, providerDef)
}

/** @param {unknown} account @param {unknown} providerDef */
export function providerPatchFromAccount(account = {}, providerDef = {}) {
  const source = recordOf(account)
  const definition = recordOf(providerDef)
  const basePatch = {
    accountId: text(source.accountId),
    accountKind: text(source.kind),
    id: accountProviderId(source) || text(definition.id),
    apiKey: '',
    sessionToken: '',
    baseUrl: text(source.baseUrl) || text(definition.defaultUrl),
    modelListPath: text(source.modelListPath),
    pathPrefix: text(source.pathPrefix),
    authType: source.authType || definition.authType,
    customAuth: recordOf(source.customAuth),
    protocol: source.protocol || definition.protocol,
    format: source.format || definition.format,
    template: recordOf(source.template)
  }
  if (!text(source.accountId) || source.kind === 'oauth-placeholder') {
    return basePatch
  }
  return { ...basePatch, accountKind: text(source.kind) || 'api-key' }
}

/** @param {unknown} config @param {unknown} accountId */
export function findProviderAccount(config = {}, accountId) {
  const id = text(accountId)
  if (!id) return null
  const accounts = recordOf(config).providerAccounts
  return (Array.isArray(accounts) ? accounts : []).map(recordOf).find(account => text(account.accountId) === id) || null
}

/** @param {unknown} config @param {unknown} account @param {unknown} providerMap */
export function upsertProviderAccount(config = {}, account = {}, providerMap = {}) {
  const sourceConfig = recordOf(config)
  const providerDef = providerDefForAnyTrack(providerMap, accountProviderId(account))
  const normalized = normalizeProviderAccount(account, providerDef)
  const current = Array.isArray(sourceConfig.providerAccounts)
    ? sourceConfig.providerAccounts.filter(isPlainObject).map(item => normalizeProviderAccount(item, providerDefForAnyTrack(providerMap, accountProviderId(item))))
    : []
  const key = providerAccountKey(normalized)
  const index = current.findIndex(item => item.accountId === normalized.accountId || providerAccountKey(item) === key)
  const providerAccounts = [...current]
  if (index >= 0) providerAccounts[index] = { ...providerAccounts[index], ...normalized }
  else providerAccounts.push(normalized)
  return { ...sourceConfig, providerAccounts }
}

/** @param {unknown} config @param {unknown} providerMap */
export function migrateProviderAccounts(config = {}, providerMap = {}) {
  const sourceConfig = recordOf(config)
  const sourceProviders = recordOf(sourceConfig.providers)
  const sourceProfiles = recordOf(sourceConfig.providerProfiles)
  const next = {
    ...sourceConfig,
    providers: { ...sourceProviders },
    providerProfiles: {
      chat: Array.isArray(sourceProfiles.chat) ? sourceProfiles.chat.filter(isPlainObject) : [],
      image: Array.isArray(sourceProfiles.image) ? sourceProfiles.image.filter(isPlainObject) : [],
      video: Array.isArray(sourceProfiles.video) ? sourceProfiles.video.filter(isPlainObject) : []
    },
    providerAccounts: Array.isArray(sourceConfig.providerAccounts)
      ? sourceConfig.providerAccounts.filter(isPlainObject).map(account => normalizeProviderAccount(account, providerDefForAnyTrack(providerMap, accountProviderId(account))))
      : []
  }

  /** @param {ProviderAccount} account @returns {ProviderAccount} */
  const addAccount = (account) => {
    const existing = next.providerAccounts.find(item => item.accountId === account.accountId || providerAccountKey(item) === providerAccountKey(account))
    if (existing) {
      const merged = {
        ...existing,
        ...account,
        apiKey: account.apiKey && account.apiKey !== SECRET_REDACTED ? account.apiKey : existing.apiKey || account.apiKey,
        sessionToken: account.sessionToken && account.sessionToken !== SECRET_REDACTED ? account.sessionToken : existing.sessionToken || account.sessionToken,
        tracks: Array.from(new Set([...(existing.tracks || []), ...(account.tracks || [])]))
      }
      const index = next.providerAccounts.indexOf(existing)
      next.providerAccounts[index] = merged
      return merged
    }
    next.providerAccounts.push(account)
    return account
  }

  /** @param {unknown} source @returns {ProviderAccount | null} */
  const linkExistingAccount = (source = {}) => {
    const id = text(recordOf(source).accountId)
    if (!id) return null
    return next.providerAccounts.find(account => account.accountId === id) || null
  }

  for (const track of TRACKS) {
    const current = recordOf(next.providers[track])
    const linkedProviderAccount = linkExistingAccount(current)
    if (linkedProviderAccount) {
      next.providers[track] = { ...current, accountId: linkedProviderAccount.accountId, accountKind: linkedProviderAccount.kind, apiKey: '', sessionToken: '' }
    } else if (credentialPresent(current)) {
      const currentAccount = accountFromProvider(track, current, providerMap)
      if (currentAccount) {
        const account = addAccount(currentAccount)
        next.providers[track] = { ...current, accountId: account.accountId, accountKind: account.kind, apiKey: '', sessionToken: '' }
      }
    }
    next.providerProfiles[track] = next.providerProfiles[track].map(item => {
      const profile = recordOf(item)
      const linkedProfileAccount = linkExistingAccount(profile)
      if (linkedProfileAccount) {
        return { ...profile, accountId: linkedProfileAccount.accountId, accountKind: linkedProfileAccount.kind, apiKey: '', sessionToken: '' }
      }
      if (!credentialPresent(profile)) return profile
      const profileAccount = accountFromProvider(track, profile, providerMap)
      if (!profileAccount) return profile
      const account = addAccount(profileAccount)
      return { ...profile, accountId: account.accountId, accountKind: account.kind, apiKey: '', sessionToken: '' }
    })
  }

  return next
}
