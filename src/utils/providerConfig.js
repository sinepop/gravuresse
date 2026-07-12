// @ts-check

/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{ id: string, labelKey: string, template: UnknownRecord }} ProviderTemplatePreset */

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

/** @param {unknown} provider */
export function firstProviderModel(provider = {}) {
  const record = recordOf(provider)
  return text(record.defaultModel) || (Array.isArray(record.modelCatalog) ? text(record.modelCatalog.find(item => typeof item === 'string' && item)) : '')
}

const TEMPLATE_KEYS = [
  'path',
  'pathPrefix',
  'submitPath',
  'pollPath',
  'taskIdPath',
  'statusPath',
  'videoUrlPath',
  'progressPath',
  'errorPath',
  'imageUrlPath',
  'responsePath',
  'body',
  'requestBody',
  'submitBody',
  'pollBody',
  'method',
  'submitMethod',
  'pollMethod'
]

/** @param {unknown} source @returns {UnknownRecord} */
export function normalizeProviderTemplate(source = {}) {
  const record = recordOf(source)
  /** @type {UnknownRecord} */
  const template = {
    ...recordOf(record.customTemplate),
    ...recordOf(record.template)
  }
  for (const key of TEMPLATE_KEYS) {
    if (Object.hasOwn(record, key) && record[key] !== undefined && record[key] !== null && record[key] !== '') {
      template[key] = record[key]
    }
  }
  return template
}

/** @param {unknown} track @param {unknown} provider */
export function providerNeedsTemplatePaths(track, provider = {}) {
  const record = recordOf(provider)
  if (track === 'image') return record.integrationStatus === 'custom-template'
  if (track === 'video') {
    return record.id === 'custom-video' ||
      record.protocol === 'custom_video_task' ||
      record.integrationStatus === 'custom-template'
  }
  return false
}

/** @param {unknown} track @param {unknown} providerConfig */
export function providerTemplatePathStatus(track, providerConfig = {}) {
  const template = normalizeProviderTemplate(providerConfig)
  if (track === 'image') {
    const path = text(template.path) || text(template.submitPath)
    return { ready: Boolean(path), detail: path || '' }
  }
  if (track === 'video') {
    const submitPath = text(template.submitPath)
    const pollPath = text(template.pollPath)
    return {
      ready: Boolean(submitPath && pollPath),
      detail: [submitPath || 'submitPath', pollPath || 'pollPath'].join(' / ')
    }
  }
  return { ready: true, detail: '' }
}

/**
 * @param {unknown} track
 * @param {unknown} provider
 * @returns {ProviderTemplatePreset[]}
 */
export function providerTemplatePresets(track, provider = {}) {
  const providerRecord = recordOf(provider)
  if (track === 'image') {
    const openAiImageTemplate = () => ({
      path: '/v1/images/generations',
      method: 'POST',
      requestBody: {
        model: '{model}',
        prompt: '{prompt}',
        size: '1024x1024'
      },
      imageUrlPath: 'data[0].url',
      pollPath: '/v1/images/tasks/{taskId}',
      pollMethod: 'GET',
      taskIdPath: 'data.task_id',
      statusPath: 'data.status'
    })
    /** @type {ProviderTemplatePreset[]} */
    const presets = [
      {
        id: 'openai-image-json',
        labelKey: 'presetOpenAiImageJson',
        template: openAiImageTemplate()
      },
      {
        id: 'newapi-image-json',
        labelKey: 'presetNewApiImageJson',
        template: openAiImageTemplate()
      },
      {
        id: 'sub2api-image-json',
        labelKey: 'presetSub2ApiImageJson',
        template: openAiImageTemplate()
      },
      {
        id: 'cpa-image-json',
        labelKey: 'presetCpaImageJson',
        template: openAiImageTemplate()
      },
      {
        id: 'generic-image-json',
        labelKey: 'presetGenericImageJson',
        template: {
          path: '/v1/images',
          method: 'POST',
          requestBody: {
            model: '{model}',
            prompt: '{prompt}',
            ratio: '{ratio}',
            negative_prompt: '{negativePrompt}'
          },
          imageUrlPath: 'data[0].url'
        }
      }
    ]
    if (providerRecord.id === 'fal') {
      presets.unshift({
        id: 'fal-image',
        labelKey: 'presetFalImage',
        template: {
          path: '/{model}',
          method: 'POST',
          requestBody: {
            prompt: '{prompt}'
          },
          imageUrlPath: 'images[0].url'
        }
      })
    }
    if (providerRecord.id === 'replicate') {
      presets.unshift({
        id: 'replicate-image-prediction',
        labelKey: 'presetReplicatePrediction',
        template: {
          path: '/v1/models/{model}/predictions',
          method: 'POST',
          requestBody: {
            input: {
              prompt: '{prompt}'
            }
          },
          imageUrlPath: 'output[0]'
        }
      })
    }
    return presets
  }

  if (track === 'video') {
    /** @type {ProviderTemplatePreset[]} */
    const presets = [
      {
        id: 'generic-video-task',
        labelKey: 'presetGenericVideoTask',
        template: {
          submitPath: '/v1/videos',
          submitMethod: 'POST',
          submitBody: {
            model: '{model}',
            prompt: '{prompt}',
            ratio: '{ratio}',
            image_url: '{sourceImageUrl}'
          },
          pollPath: '/v1/videos/{taskId}',
          pollMethod: 'GET',
          taskIdPath: 'data.id',
          statusPath: 'data.status',
          videoUrlPath: 'data.video_url'
        }
      }
    ]
    if (providerRecord.id === 'replicate') {
      presets.unshift({
        id: 'replicate-video-prediction',
        labelKey: 'presetReplicatePrediction',
        template: {
          submitPath: '/v1/models/{model}/predictions',
          submitMethod: 'POST',
          submitBody: {
            input: {
              prompt: '{prompt}',
              image: '{sourceImageUrl}'
            }
          },
          pollPath: '/v1/predictions/{taskId}',
          pollMethod: 'GET',
          taskIdPath: 'id',
          statusPath: 'status',
          videoUrlPath: 'output[0]'
        }
      })
    }
    return presets
  }

  return []
}

/**
 * Build a single "current chat provider" object from the new providers array format.
 * Returns something compatible with the old config.providers.chat shape so callers
 * (useChat.js, ModelSelector, Settings) don't need to branch on format.
 */
/** @param {unknown} config @returns {UnknownRecord} */
export function resolveChatProvider(config) {
  const providers = recordOf(recordOf(config).providers)
  return recordOf(providers.chat)
}

/**
 * Build ModelSelector-compatible profiles from the config.providers array.
 * Each model in each enabled provider becomes its own profile entry so the
 * dropdown can display all models grouped by provider name.
 */
/** @param {unknown} config @returns {UnknownRecord[]} */
export function buildConfigProviderProfiles(config) {
  const sourceProviders = recordOf(config).chatProviders
  const providers = Array.isArray(sourceProviders) ? sourceProviders.map(recordOf) : []
  /** @type {UnknownRecord[]} */
  const profiles = []
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]
    if (p.enabled === false) continue
    const models = Array.isArray(p.models) ? p.models.filter((model) => typeof model === 'string' && model) : []
    const defaultModel = text(p.defaultModel)
    if (!models.length && defaultModel) models.push(defaultModel)
    for (const model of models) {
      profiles.push({
        id: 'custom-chat',
        providerId: 'custom-chat',
        name: text(p.name),
        baseUrl: text(p.baseUrl),
        apiKey: text(p.apiKey),
        model,
        format: 'openai',
        authType: { type: 'bearer' },
        _configProviderIndex: i
      })
    }
  }
  return profiles
}

/**
 * Apply a patch to the chat provider config and return the updated config.
 * For the new array format, "model" patches update savedChatModel; other
 * patches (baseUrl, apiKey, etc.) are applied to the targeted provider entry.
 * The patch may carry _configProviderIndex to select a specific provider in
 * the array; falls back to the first enabled provider.
 * Strips adapter-only fields (_configProvider, _configProviderIndex) from the
 * patch before writing to the array.
 */
/** @param {unknown} config @param {unknown} patch @returns {UnknownRecord} */
export function applyChatProviderPatch(config, patch) {
  const sourceConfig = recordOf(config)
  if (!isPlainObject(patch)) return sourceConfig
  /** @type {UnknownRecord} */
  const next = { ...sourceConfig }

  if ('model' in patch) {
    next.savedChatModel = patch.model || ''
  }

  // Fields that are adapter-only and must not be written to the providers array
  const ADAPTER_KEYS = new Set(['id', 'platform', 'name', 'defaultModel', 'models', 'format', 'authType', 'capabilities', '_configProvider', '_configProviderIndex'])
  /** @type {UnknownRecord} */
  const arrayPatch = {}
  /** @type {number | undefined} */
  let targetIndex
  for (const [k, v] of Object.entries(patch)) {
    if (k === '_configProviderIndex') { targetIndex = typeof v === 'number' ? v : undefined; continue }
    if (!ADAPTER_KEYS.has(k)) arrayPatch[k] = v
  }

  if (Array.isArray(next.providers)) {
    if (Object.keys(arrayPatch).length > 0) {
      const arr = next.providers.map(recordOf)
      const idx = (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < arr.length && arr[targetIndex].enabled !== false)
        ? targetIndex
        : arr.findIndex(p => p.enabled !== false)
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...arrayPatch }
        next.providers = arr
      }
    }
  } else if (isPlainObject(next.providers) && next.providers.chat) {
    // Legacy object format
    const { _configProvider, _configProviderIndex, ...cleanPatch } = patch
    next.providers = { ...next.providers, chat: { ...recordOf(next.providers.chat), ...cleanPatch } }
  }

  return next
}

/**
 * Get a list of provider defs from the new config.providers array.
 * Each entry is shaped like a registry provider for compatibility with the
 * existing provider selection UI, with the raw entry attached as _configProvider.
 */
/** @param {unknown} config @returns {UnknownRecord[]} */
export function getProvidersFromConfig(config) {
  /** @type {UnknownRecord[]} */
  const list = []
  const sourceProviders = recordOf(config).chatProviders
  const arr = Array.isArray(sourceProviders) ? sourceProviders : []
  for (const item of arr) {
    if (!isPlainObject(item)) continue
    const p = item
    if (p.enabled === false) continue
    list.push({
      id: 'custom-chat',
      name: text(p.name),
      platform: 'Custom',
      defaultUrl: text(p.baseUrl),
      defaultModel: text(p.defaultModel),
      format: 'openai',
      authType: { type: 'bearer' },
      capabilities: { chat: { text: true, openaiCompatible: true, relay: true } },
      modelCatalog: Array.isArray(p.models) ? p.models.filter(model => typeof model === 'string') : [],
      _configProvider: p
    })
  }
  return list
}

/** @param {unknown} track @param {unknown} provider @returns {ProviderTemplatePreset | undefined} */
export function defaultProviderTemplatePreset(track, provider = {}) {
  const record = recordOf(provider)
  if (record.id === 'custom-video') {
    return providerTemplatePresets(track, record).find(preset => preset.id === 'generic-video-task')
  }
  const id = text(record.id)
  return providerTemplatePresets(track, record).find(preset =>
    preset.id === `${id}-${track}` || preset.id.startsWith(`${id}-`)
  )
}

function advancedProviderReset() {
  return {
    customAuth: {},
    authConfig: undefined,
    template: {},
    customTemplate: undefined,
    generationOptions: undefined,
    pathPrefix: '',
    modelListPath: '',
    modelsPath: '',
    path: '',
    submitPath: '',
    pollPath: '',
    taskIdPath: '',
    statusPath: '',
    videoUrlPath: '',
    progressPath: '',
    errorPath: '',
    imageUrlPath: '',
    responsePath: '',
    body: '',
    requestBody: '',
    submitBody: '',
    pollBody: '',
    method: '',
    submitMethod: '',
    pollMethod: '',
    timeout: '',
    pollInterval: ''
  }
}

/** @param {unknown} provider @param {unknown} track */
export function createProviderSelectionPatch(provider = {}, track = '') {
  const record = recordOf(provider)
  const defaultTemplate = defaultProviderTemplatePreset(track, record)?.template || {}
  return {
    ...advancedProviderReset(),
    id: text(record.id),
    accountId: '',
    accountKind: '',
    apiKey: '',
    sessionToken: '',
    baseUrl: text(record.defaultUrl),
    model: firstProviderModel(record),
    protocol: record.protocol,
    format: record.format,
    authType: record.authType,
    template: defaultTemplate
  }
}

/** @param {unknown} profile */
export function createProviderProfilePatch(profile = {}) {
  const record = recordOf(profile)
  const template = normalizeProviderTemplate(record)
  return {
    ...advancedProviderReset(),
    id: text(record.providerId) || text(record.id),
    accountId: text(record.accountId),
    accountKind: text(record.accountKind),
    apiKey: text(record.apiKey),
    sessionToken: text(record.sessionToken),
    baseUrl: text(record.baseUrl),
    model: text(record.model),
    protocol: record.protocol,
    format: record.format,
    authType: record.authType,
    customAuth: recordOf(record.customAuth),
    template,
    pathPrefix: text(record.pathPrefix),
    modelListPath: text(record.modelListPath) || text(record.modelsPath),
    timeout: typeof record.timeout === 'number' || typeof record.timeout === 'string' ? record.timeout : '',
    pollInterval: typeof record.pollInterval === 'number' || typeof record.pollInterval === 'string' ? record.pollInterval : '',
    defaultNegPrompt: text(record.defaultNegPrompt),
    customSystemPrompt: text(record.customSystemPrompt),
    ...(typeof record._configProviderIndex === 'number' ? { _configProviderIndex: record._configProviderIndex } : {})
  }
}

export function createProviderClearPatch() {
  return {
    ...advancedProviderReset(),
    id: '',
    accountId: '',
    accountKind: '',
    apiKey: '',
    sessionToken: '',
    baseUrl: '',
    model: '',
    protocol: undefined,
    format: undefined,
    authType: undefined,
    defaultNegPrompt: '',
    customSystemPrompt: ''
  }
}
