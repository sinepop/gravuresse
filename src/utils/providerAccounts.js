const TRACKS = ['chat', 'image', 'video']
const SECRET_REDACTED = '********'

export const OPENAI_COMPATIBLE_GATEWAY_PRESETS = [
  { id: 'openai-compatible', label: 'OpenAI-compatible', name: 'OpenAI-compatible Relay' },
  { id: 'newapi', label: 'New API / One API', name: 'New API / One API Relay' },
  { id: 'sub2api', label: 'sub2api', name: 'sub2api Relay' },
  { id: 'cpa-compatible', label: 'CPA compatible', name: 'CPA compatible Relay' }
]

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function accountProviderId(account = {}) {
  return account.providerId || account.id || ''
}

function accountBaseUrl(account = {}) {
  return String(account.baseUrl || '').trim().replace(/\/+$/, '')
}

function accountAuthSignature(account = {}) {
  const customType = normalizeAuthType(account.customAuth?.type)
  const type = customType || normalizeAuthType(account.authType?.type || account.authType)
  const key = account.customAuth?.headerName || account.customAuth?.paramName || account.customAuth?.sessionHeaderName || account.customAuth?.key || account.authType?.key || ''
  return [type || 'bearer', key].join(':')
}

export function providerAccountKey(account = {}) {
  return [
    account.kind || 'api-key',
    accountProviderId(account),
    accountBaseUrl(account),
    accountAuthSignature(account)
  ].join('|')
}

export function makeProviderAccountId(account = {}) {
  return `acct_${hashString(providerAccountKey(account))}`
}

export function providerGatewayPresetPatch(presetId = 'openai-compatible') {
  const preset = OPENAI_COMPATIBLE_GATEWAY_PRESETS.find(item => item.id === presetId) || OPENAI_COMPATIBLE_GATEWAY_PRESETS[0]
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

export function normalizeProviderAccount(account = {}, providerDef = {}) {
  const providerId = accountProviderId(account) || providerDef.id || ''
  const kind = account.kind || (account.oauthPlaceholder ? 'oauth-placeholder' : providerId === 'openai-compatible-relay' ? 'gateway' : 'api-key')
  const baseUrl = account.baseUrl || providerDef.defaultUrl || providerDef.defaults?.baseUrl || ''
  const normalized = {
    accountId: account.accountId || makeProviderAccountId({ ...account, kind, providerId, baseUrl }),
    kind,
    providerId,
    name: account.name || providerDef.name || providerId,
    apiKey: account.apiKey || '',
    sessionToken: account.sessionToken || '',
    baseUrl,
    modelListPath: account.modelListPath || account.modelsPath || providerDef.modelListPath || providerDef.modelsPath || '',
    pathPrefix: account.pathPrefix || providerDef.pathPrefix || '',
    authType: account.authType || providerDef.authType,
    customAuth: isPlainObject(account.customAuth) ? account.customAuth : {},
    protocol: account.protocol || providerDef.protocol,
    format: account.format || providerDef.format,
    template: isPlainObject(account.template) ? account.template : {},
    tracks: Array.isArray(account.tracks) ? account.tracks.filter(track => TRACKS.includes(track)) : [],
    status: account.status || (kind === 'oauth-placeholder' ? 'placeholder' : '')
  }
  normalized.accountId = account.accountId || makeProviderAccountId(normalized)
  return normalized
}

function providerForTrack(providerMap = {}, track, providerId) {
  return (providerMap?.[track] || []).find(provider => provider.id === providerId) || {}
}

function providerDefForAnyTrack(providerMap = {}, providerId) {
  for (const track of TRACKS) {
    const provider = providerForTrack(providerMap, track, providerId)
    if (provider?.id) return provider
  }
  return {}
}

function credentialPresent(source = {}) {
  return Boolean(source.apiKey || source.sessionToken)
}

function accountFromProvider(track, source = {}, providerMap = {}, kind = 'api-key') {
  const providerId = source.providerId || source.id
  if (!providerId) return null
  const providerDef = providerForTrack(providerMap, track, providerId)
  return normalizeProviderAccount({
    accountId: source.accountId || '',
    kind: source.accountKind || source.kind || kind,
    providerId,
    name: source.name || providerDef?.name || providerId,
    apiKey: source.apiKey || '',
    sessionToken: source.sessionToken || '',
    baseUrl: source.baseUrl || providerDef?.defaultUrl || '',
    modelListPath: source.modelListPath || source.modelsPath || '',
    pathPrefix: source.pathPrefix || '',
    authType: source.authType || providerDef?.authType,
    customAuth: source.customAuth || {},
    protocol: source.protocol || providerDef?.protocol,
    format: source.format || providerDef?.format,
    template: source.template || source.customTemplate || {},
    tracks: [track]
  }, providerDef)
}

export function providerPatchFromAccount(account = {}, providerDef = {}) {
  const basePatch = {
    accountId: account.accountId || '',
    accountKind: account.kind || '',
    id: accountProviderId(account) || providerDef.id,
    apiKey: '',
    sessionToken: '',
    baseUrl: account.baseUrl || providerDef.defaultUrl || '',
    modelListPath: account.modelListPath || '',
    pathPrefix: account.pathPrefix || '',
    authType: account.authType || providerDef.authType,
    customAuth: account.customAuth || {},
    protocol: account.protocol || providerDef.protocol,
    format: account.format || providerDef.format,
    template: account.template || {}
  }
  if (!account.accountId || account.kind === 'oauth-placeholder') {
    return basePatch
  }
  return { ...basePatch, accountKind: account.kind || 'api-key' }
}

export function findProviderAccount(config = {}, accountId) {
  if (!accountId) return null
  return (config.providerAccounts || []).find(account => account.accountId === accountId) || null
}

export function upsertProviderAccount(config = {}, account = {}, providerMap = {}) {
  const providerDef = providerDefForAnyTrack(providerMap, accountProviderId(account))
  const normalized = normalizeProviderAccount(account, providerDef)
  const current = Array.isArray(config.providerAccounts) ? config.providerAccounts : []
  const key = providerAccountKey(normalized)
  const index = current.findIndex(item => item.accountId === normalized.accountId || providerAccountKey(item) === key)
  const providerAccounts = [...current]
  if (index >= 0) providerAccounts[index] = { ...providerAccounts[index], ...normalized }
  else providerAccounts.push(normalized)
  return { ...config, providerAccounts }
}

export function migrateProviderAccounts(config = {}, providerMap = {}) {
  const next = {
    ...config,
    providers: { ...(config.providers || {}) },
    providerProfiles: {
      chat: [...(config.providerProfiles?.chat || [])],
      image: [...(config.providerProfiles?.image || [])],
      video: [...(config.providerProfiles?.video || [])]
    },
    providerAccounts: Array.isArray(config.providerAccounts)
      ? config.providerAccounts.map(account => normalizeProviderAccount(account, providerDefForAnyTrack(providerMap, accountProviderId(account))))
      : []
  }

  const addAccount = (account) => {
    if (!account) return null
    const existing = next.providerAccounts.find(item => item.accountId === account.accountId || providerAccountKey(item) === providerAccountKey(account))
    if (existing) {
      const merged = {
        ...existing,
        ...account,
        apiKey: account.apiKey && account.apiKey !== SECRET_REDACTED ? account.apiKey : existing.apiKey || account.apiKey || '',
        sessionToken: account.sessionToken && account.sessionToken !== SECRET_REDACTED ? account.sessionToken : existing.sessionToken || account.sessionToken || '',
        tracks: Array.from(new Set([...(existing.tracks || []), ...(account.tracks || [])]))
      }
      const index = next.providerAccounts.indexOf(existing)
      next.providerAccounts[index] = merged
      return merged
    }
    next.providerAccounts.push(account)
    return account
  }

  const linkExistingAccount = (source = {}) => {
    if (!source.accountId) return null
    return next.providerAccounts.find(account => account.accountId === source.accountId) || null
  }

  for (const track of TRACKS) {
    const current = next.providers?.[track] || {}
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
    next.providerProfiles[track] = (next.providerProfiles[track] || []).map(profile => {
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
