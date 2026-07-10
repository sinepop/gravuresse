export function firstProviderModel(provider = {}) {
  return provider.defaultModel || (Array.isArray(provider.modelCatalog) ? provider.modelCatalog.find(Boolean) : '') || ''
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

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function normalizeProviderTemplate(source = {}) {
  const template = {
    ...(isPlainObject(source.customTemplate) ? source.customTemplate : {}),
    ...(isPlainObject(source.template) ? source.template : {})
  }
  for (const key of TEMPLATE_KEYS) {
    if (Object.hasOwn(source || {}, key) && source[key] !== undefined && source[key] !== null && source[key] !== '') {
      template[key] = source[key]
    }
  }
  return template
}

export function providerNeedsTemplatePaths(track, provider = {}) {
  if (track === 'image') return provider.integrationStatus === 'custom-template'
  if (track === 'video') {
    return provider.id === 'custom-video' ||
      provider.protocol === 'custom_video_task' ||
      provider.integrationStatus === 'custom-template'
  }
  return false
}

export function providerTemplatePathStatus(track, providerConfig = {}) {
  const template = normalizeProviderTemplate(providerConfig)
  if (track === 'image') {
    const path = template.path || template.submitPath || ''
    return { ready: Boolean(path), detail: path || '' }
  }
  if (track === 'video') {
    const submitPath = template.submitPath || ''
    const pollPath = template.pollPath || ''
    return {
      ready: Boolean(submitPath && pollPath),
      detail: [submitPath || 'submitPath', pollPath || 'pollPath'].join(' / ')
    }
  }
  return { ready: true, detail: '' }
}

export function providerTemplatePresets(track, provider = {}) {
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
    if (provider.id === 'fal') {
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
    if (provider.id === 'replicate') {
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
    if (provider.id === 'replicate') {
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
export function resolveChatProvider(config) {
  // New array format
  if (Array.isArray(config?.providers)) {
    const arr = config.providers.filter(p => p.enabled !== false)
    const first = arr[0]
    if (!first) return {}
    return {
      id: 'custom-chat',
      name: first.name,
      platform: 'Custom',
      baseUrl: first.baseUrl || '',
      apiKey: first.apiKey || '',
      model: config?.savedChatModel || first.defaultModel || '',
      defaultModel: first.defaultModel || '',
      models: first.models || [],
      format: 'openai',
      authType: { type: 'bearer' },
      capabilities: { chat: { text: true, openaiCompatible: true, relay: true } },
      _configProviderIndex: 0,
      _configProvider: first
    }
  }
  // Legacy object format: { chat: {...}, image: {...}, video: {...} }
  if (config?.providers && typeof config.providers === 'object' && !Array.isArray(config.providers)) {
    return config.providers.chat || {}
  }
  return {}
}

/**
 * Apply a patch to the chat provider config and return the updated config.
 * For the new array format, "model" patches update savedChatModel; other
 * patches (baseUrl, apiKey, etc.) are applied to the first enabled provider entry.
 * Strips adapter-only fields (_configProvider, _configProviderIndex) from the patch
 * before writing to the array.
 */
export function applyChatProviderPatch(config, patch) {
  if (!patch || typeof patch !== 'object') return config
  const next = { ...config }

  if ('model' in patch) {
    next.savedChatModel = patch.model || ''
  }

  // Fields that are adapter-only and must not be written to the providers array
  const ADAPTER_KEYS = new Set(['id', 'platform', 'name', 'defaultModel', 'models', 'format', 'authType', 'capabilities', '_configProvider', '_configProviderIndex'])
  const arrayPatch = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!ADAPTER_KEYS.has(k)) arrayPatch[k] = v
  }

  if (Array.isArray(next.providers)) {
    if (Object.keys(arrayPatch).length > 0) {
      const arr = [...next.providers]
      const idx = arr.findIndex(p => p.enabled !== false)
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...arrayPatch }
        next.providers = arr
      }
    }
  } else if (next.providers && typeof next.providers === 'object' && next.providers.chat) {
    // Legacy object format
    const { _configProvider, _configProviderIndex, ...cleanPatch } = patch
    next.providers = { ...next.providers, chat: { ...next.providers.chat, ...cleanPatch } }
  }

  return next
}

/**
 * Get a list of provider defs from the new config.providers array.
 * Each entry is shaped like a registry provider for compatibility with the
 * existing provider selection UI, with the raw entry attached as _configProvider.
 */
export function getProvidersFromConfig(config) {
  const list = []
  const arr = Array.isArray(config?.providers) ? config.providers : []
  for (const p of arr) {
    if (p.enabled === false) continue
    list.push({
      id: 'custom-chat',
      name: p.name,
      platform: 'Custom',
      defaultUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      format: 'openai',
      authType: { type: 'bearer' },
      capabilities: { chat: { text: true, openaiCompatible: true, relay: true } },
      modelCatalog: Array.isArray(p.models) ? p.models : [],
      _configProvider: p
    })
  }
  return list
}

export function defaultProviderTemplatePreset(track, provider = {}) {
  if (provider.id === 'custom-video') {
    return providerTemplatePresets(track, provider).find(preset => preset.id === 'generic-video-task')
  }
  return providerTemplatePresets(track, provider).find(preset =>
    preset.id === `${provider.id}-${track}` || preset.id.startsWith(`${provider.id}-`)
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

export function createProviderSelectionPatch(provider = {}, track = '') {
  const defaultTemplate = defaultProviderTemplatePreset(track, provider)?.template || {}
  return {
    ...advancedProviderReset(),
    id: provider.id,
    accountId: '',
    accountKind: '',
    apiKey: '',
    sessionToken: '',
    baseUrl: provider.defaultUrl || '',
    model: firstProviderModel(provider),
    protocol: provider.protocol,
    format: provider.format,
    authType: provider.authType,
    template: defaultTemplate
  }
}

export function createProviderProfilePatch(profile = {}) {
  const template = normalizeProviderTemplate(profile)
  return {
    ...advancedProviderReset(),
    id: profile.providerId || profile.id,
    accountId: profile.accountId || '',
    accountKind: profile.accountKind || '',
    apiKey: profile.apiKey || '',
    sessionToken: profile.sessionToken || '',
    baseUrl: profile.baseUrl || '',
    model: profile.model || '',
    protocol: profile.protocol,
    format: profile.format,
    authType: profile.authType,
    customAuth: profile.customAuth || {},
    template,
    pathPrefix: profile.pathPrefix || '',
    modelListPath: profile.modelListPath || profile.modelsPath || '',
    timeout: profile.timeout || '',
    pollInterval: profile.pollInterval || '',
    defaultNegPrompt: profile.defaultNegPrompt || '',
    customSystemPrompt: profile.customSystemPrompt || ''
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
