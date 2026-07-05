const { getProvider, getConstraints } = require('./registry')
const { resolveHandler } = require('./handler')

const ACTION_TO_TRACK = {
  chat: 'chat',
  image: 'image',
  generate: 'image',
  video: 'video',
  submit: 'video',
  poll: 'video'
}

const CUSTOM_TEMPLATE_FIELDS = [
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
  'method',
  'submitMethod',
  'pollMethod'
]

const CUSTOM_TEMPLATE_BODY_FIELDS = [
  'body',
  'requestBody',
  'submitBody',
  'pollBody'
]

const CUSTOM_TEMPLATE_SUBMIT_FIELDS = [
  'path',
  'pathPrefix',
  'submitPath',
  'body',
  'requestBody',
  'submitBody'
]

const CUSTOM_TEMPLATE_POLL_FIELDS = [
  'pollPath',
  'pollBody'
]

const ALLOWED_TEMPLATE_VARIABLES = [
  'prompt',
  'model',
  'ratio',
  'resolution',
  'duration',
  'sourceImageUrl',
  'negativePrompt'
]

const ALLOWED_POLL_TEMPLATE_VARIABLES = [
  ...ALLOWED_TEMPLATE_VARIABLES,
  'taskId'
]
const hasOwn = Object.hasOwn || ((obj, key) => Object.prototype.hasOwnProperty.call(obj, key))

function validateGenerationRequest(trackOrAction, providerOrId, task = {}) {
  const track = ACTION_TO_TRACK[trackOrAction] || trackOrAction
  const provider = typeof providerOrId === 'string' ? getProvider(providerOrId) : providerOrId
  const errors = []
  const warnings = []
  const options = { ...(task.generationOptions || {}), ...task }

  if (!['image', 'video'].includes(track)) {
    errors.push(error('UNSUPPORTED_TRACK', 'track', `Validation only supports image/video generation, got '${trackOrAction}'.`))
    return result(errors, warnings, options)
  }

  if (!provider) {
    errors.push(error('UNKNOWN_PROVIDER', 'provider', 'Unknown provider.'))
    return result(errors, warnings, options)
  }

  if (!provider[track]) {
    errors.push(error('UNSUPPORTED_PROVIDER_TRACK', 'provider', `${provider.id} does not support ${track}.`))
    return result(errors, warnings, options)
  }

  const constraints = getConstraints(provider.id, track) || provider.constraints?.[track] || {}
  options.providerId = provider.id
  options.track = track
  options.model = firstText(options.model, provider[track]?.defaultModel)

  validatePrompt(options, constraints, errors)
  validateNegativePrompt(options, constraints, errors, warnings)
  validateRatio(options, constraints, errors)
  validateResolution(options, constraints, errors)
  validateDuration(track, options, constraints, errors, warnings)
  validateSourceImage(track, provider, options, constraints, errors)

  if (constraints.async === true || provider[track]?.polling) {
    options.async = true
  }

  if (shouldValidateCustomTemplate(track, provider, options)) {
    validateCustomTemplate(customTemplateFromOptions(options), errors, track)
  }

  return result(errors, warnings, options)
}

function validatePrompt(options, constraints, errors) {
  const prompt = firstText(options.prompt, options.text)
  options.prompt = prompt

  if (!prompt.trim()) {
    errors.push(error('PROMPT_REQUIRED', 'prompt', 'Prompt is required before generation.'))
    return
  }

  const maxLength = constraints.prompt?.maxLength
  if (maxLength && charLength(prompt) > maxLength) {
    errors.push(error(
      'PROMPT_TOO_LONG',
      'prompt',
      `Prompt is ${charLength(prompt)} characters; this provider allows up to ${maxLength}.`,
      `Shorten the prompt to ${maxLength} characters or choose a provider with a larger prompt limit.`
    ))
  }
}

function validateNegativePrompt(options, constraints, errors, warnings) {
  const value = firstText(options.negativePrompt, options.negative_prompt, options.defaultNegPrompt)
  if (!value.trim()) return

  const support = constraints.negativePrompt || { supported: false, strategy: 'unsupported' }
  const strategy = support.strategy || (support.supported ? 'native' : 'unsupported')

  if (!support.supported && strategy === 'unsupported') {
    errors.push(error(
      'NEGATIVE_PROMPT_UNSUPPORTED',
      'negativePrompt',
      'This provider does not support negative prompts.',
      'Remove the negative prompt or choose a provider that supports it.'
    ))
    return
  }

  if (support.maxLength && charLength(value) > support.maxLength) {
    errors.push(error(
      'NEGATIVE_PROMPT_TOO_LONG',
      'negativePrompt',
      `Negative prompt is ${charLength(value)} characters; this provider allows up to ${support.maxLength}.`,
      `Shorten the negative prompt to ${support.maxLength} characters.`
    ))
  }

  if (strategy === 'appendToPrompt') {
    warnings.push(warn(
      'NEGATIVE_PROMPT_APPENDED',
      'negativePrompt',
      'This provider has no native negative prompt field; the handler appends it to the prompt.'
    ))
  }

  if (strategy === 'modelDependent' || strategy === 'templateDependent') {
    warnings.push(warn(
      'NEGATIVE_PROMPT_MODEL_DEPENDENT',
      'negativePrompt',
      'Negative prompt support depends on the selected model or custom template.'
    ))
  }

  options.negativePrompt = value
  options.negative_prompt = value
}

function validateRatio(options, constraints, errors) {
  const ratios = constraints.ratios || []
  if (!ratios.length) return

  const ratio = firstText(options.ratio, options.aspectRatio, ratios[0])
  options.ratio = ratio
  options.aspectRatio = ratio

  if (!ratios.includes(ratio)) {
    errors.push(error(
      'RATIO_UNSUPPORTED',
      'ratio',
      `Aspect ratio '${ratio}' is not supported by this provider.`,
      `Use one of: ${ratios.join(', ')}.`
    ))
  }
}

function validateResolution(options, constraints, errors) {
  const resolutions = constraints.resolutions || []
  const resolution = firstText(options.resolution, options.quality)
  if (!resolution) return

  options.resolution = resolution

  if (resolutions.length && !resolutions.includes(resolution)) {
    errors.push(error(
      'RESOLUTION_UNSUPPORTED',
      'resolution',
      `Resolution '${resolution}' is not supported by this provider.`,
      `Use one of: ${resolutions.join(', ')}.`
    ))
  }
}

function validateDuration(track, options, constraints, errors, warnings) {
  if (track !== 'video') return

  const rule = constraints.duration || { supported: false }
  const raw = firstDefined(options.duration, options.defaultDuration)

  if (raw === undefined || raw === null || raw === '') {
    if (rule.default !== undefined) options.duration = rule.default
    return
  }

  if (!rule.supported) {
    errors.push(error('DURATION_UNSUPPORTED', 'duration', 'This provider does not support a duration parameter.'))
    return
  }

  const duration = Number(raw)
  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push(error('DURATION_INVALID', 'duration', `Duration '${raw}' is not a positive number.`, 'Use a duration in seconds.'))
    return
  }

  if (rule.min !== undefined && duration < rule.min) {
    errors.push(error('DURATION_TOO_SHORT', 'duration', `Duration ${duration}s is below the ${rule.min}s minimum.`))
    return
  }

  if (rule.max !== undefined && duration > rule.max) {
    errors.push(error('DURATION_TOO_LONG', 'duration', `Duration ${duration}s exceeds the ${rule.max}s maximum.`))
    return
  }

  if (Array.isArray(rule.allowed) && rule.allowed.length && !rule.allowed.includes(duration)) {
    if (rule.coerce === 'nearest') {
      const normalized = nearest(duration, rule.allowed)
      options.duration = normalized
      warnings.push(warn(
        'DURATION_NORMALIZED',
        'duration',
        `Duration ${duration}s was normalized to ${normalized}s for this provider.`
      ))
      return
    }

    errors.push(error(
      'DURATION_UNSUPPORTED',
      'duration',
      `Duration ${duration}s is not supported by this provider.`,
      `Use one of: ${rule.allowed.join(', ')} seconds.`
    ))
    return
  }

  options.duration = duration
}

function validateSourceImage(track, provider, options, constraints, errors) {
  if (track !== 'video') return

  const rule = constraints.sourceImage || {}
  const mode = firstText(options.mode, options.generationMode, options.sourceImageUrl ? 'image_to_video' : 'text_to_video')
  const sourceImageUrl = firstText(options.sourceImageUrl, options.imageUrl, options.firstFrameUrl)
  const providerOnlyImageToVideo = provider.capabilities?.video?.imageToVideo && !provider.capabilities?.video?.textToVideo
  const requiresForMode = Array.isArray(rule.requiredForModes) && rule.requiredForModes.includes(mode)
  const required = Boolean(rule.required || requiresForMode || providerOnlyImageToVideo)

  options.mode = mode
  if (sourceImageUrl) options.sourceImageUrl = sourceImageUrl

  if (required && !sourceImageUrl) {
    errors.push(error(
      'SOURCE_IMAGE_REQUIRED',
      'sourceImageUrl',
      'This image-to-video provider requires a source image.',
      'Attach or select a source image before submitting the video task.'
    ))
  }
}

function customTemplateFromOptions(options) {
  const directTemplate = [options.template, options.customTemplate].find(value => value !== undefined && value !== null && value !== '')
  if (directTemplate !== undefined && typeof directTemplate !== 'object') {
    return directTemplate
  }

  const template = {}
  const sources = [
    options.generationOptions?.template,
    options.generationOptions?.customTemplate,
    options.generationOptions,
    options.customTemplate,
    options.template,
    options
  ]

  for (const source of sources) {
    Object.assign(template, pickCustomTemplateFields(source))
  }

  return template
}

function pickCustomTemplateFields(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}

  const out = {}
  for (const field of [...CUSTOM_TEMPLATE_FIELDS, ...CUSTOM_TEMPLATE_BODY_FIELDS]) {
    if (hasOwn(source, field)) out[field] = source[field]
  }
  return out
}

function shouldValidateCustomTemplate(track, provider, options) {
  const protocol = provider[track]?.protocol
  if (provider.id === 'custom-video' || protocol === 'custom_video_task') return true

  const template = customTemplateFromOptions(options)
  if (!hasCustomTemplateFields(template)) return false

  if (provider.id === 'custom-image' || String(protocol || '').startsWith('custom_image_')) return true
  return !resolveHandler(protocol)
}

function hasCustomTemplateFields(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return Boolean(template)
  return [...CUSTOM_TEMPLATE_FIELDS, ...CUSTOM_TEMPLATE_BODY_FIELDS].some(field => (
    template[field] !== undefined && template[field] !== null && template[field] !== ''
  ))
}

function validateCustomTemplate(template, errors, track = 'video') {
  if (!template || typeof template !== 'object') {
    errors.push(error('CUSTOM_TEMPLATE_REQUIRED', 'template', `Custom ${track} API requires a request template.`))
    return
  }

  if (track === 'image') {
    if (!firstText(template.path, template.submitPath).trim()) {
      errors.push(error('CUSTOM_TEMPLATE_FIELD_REQUIRED', 'template.path', 'path or submitPath is required for custom image templates.'))
    }
  } else {
    for (const field of ['submitPath', 'pollPath']) {
      if (!firstText(template[field]).trim()) {
        errors.push(error('CUSTOM_TEMPLATE_FIELD_REQUIRED', `template.${field}`, `${field} is required for custom video templates.`))
      }
    }
  }

  const templateTexts = {}

  for (const field of CUSTOM_TEMPLATE_FIELDS) {
    const text = validateTemplateStringValue(template[field], `template.${field}`, `${field} must be a string.`, errors)
    if (text !== undefined) templateTexts[field] = text
  }

  for (const field of CUSTOM_TEMPLATE_BODY_FIELDS) {
    const text = validateTemplateBodyValue(template[field], `template.${field}`, `${field} must be a JSON string, object, or array.`, errors)
    if (text !== undefined) templateTexts[field] = text
  }

  for (const field of CUSTOM_TEMPLATE_SUBMIT_FIELDS) {
    if (templateTexts[field] !== undefined) {
      validateTemplateVariables(templateTexts[field], `template.${field}`, 'submit', ALLOWED_TEMPLATE_VARIABLES, errors)
    }
  }

  for (const field of CUSTOM_TEMPLATE_POLL_FIELDS) {
    if (templateTexts[field] !== undefined) {
      validateTemplateVariables(templateTexts[field], `template.${field}`, 'poll', ALLOWED_POLL_TEMPLATE_VARIABLES, errors)
    }
  }

  for (const field of ['pathPrefix', 'path', 'submitPath', 'pollPath']) {
    if (templateTexts[field] !== undefined) {
      validateTemplateApiPath(templateTexts[field], `template.${field}`, errors)
    }
  }

  for (const field of ['taskIdPath', 'statusPath', 'videoUrlPath', 'progressPath', 'errorPath', 'imageUrlPath', 'responsePath']) {
    const value = template[field]
    if (!value) continue
    if (!isJsonPath(value)) {
      errors.push(error(
        'CUSTOM_TEMPLATE_JSONPATH_INVALID',
        `template.${field}`,
        `${field} must be a simple response path such as data.id or $.data.id.`
      ))
    }
  }
}

function validateTemplateStringValue(value, field, message, errors) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    errors.push(error('CUSTOM_TEMPLATE_FIELD_INVALID', field, message))
    return undefined
  }

  validateNoExecutableTemplate(value, field, errors)
  return value
}

function validateTemplateBodyValue(value, field, message, errors) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' && typeof value !== 'object') {
    errors.push(error('CUSTOM_TEMPLATE_BODY_INVALID', field, message))
    return undefined
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value)
  validateNoExecutableTemplate(text, field, errors)
  if (typeof value === 'string') validateJsonBodyTemplate(text, field, errors)
  return text
}

function validateJsonBodyTemplate(value, field, errors) {
  const rendered = value.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}|\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g,
    (_, a, b, c) => (a || b || c) === 'duration' ? '5' : 'text'
  )
  try {
    JSON.parse(rendered)
  } catch {
    errors.push(error(
      'CUSTOM_TEMPLATE_BODY_INVALID',
      field,
      `${field} must be valid JSON after placeholder substitution.`,
      'Wrap string variables in quotes, for example {"prompt":"{prompt}","duration":{duration}}.'
    ))
  }
}

function validateTemplateVariables(value, field, stage, allowedVariables, errors) {
  for (const variable of new Set(extractTemplateVariables(value))) {
    if (!allowedVariables.includes(variable)) {
      errors.push(error(
        'CUSTOM_TEMPLATE_VARIABLE_UNSUPPORTED',
        field,
        `Template variable '${variable}' is not allowed in ${field}.`,
        `Allowed variables for ${stage} templates: ${allowedVariables.join(', ')}.`
      ))
    }
  }
}

function validateNoExecutableTemplate(value, field, errors) {
  const forbidden = [
    /\beval\s*\(/i,
    /\bFunction\s*\(/,
    /=>/,
    /<script/i,
    /\brequire\s*\(/i,
    /\bimport\s*\(/i
  ]

  if (forbidden.some(pattern => pattern.test(value))) {
    errors.push(error(
      'CUSTOM_TEMPLATE_EXECUTION_UNSUPPORTED',
      field,
      'Custom templates only support placeholder substitution; executable code is not allowed.'
    ))
  }
}

function validateTemplateApiPath(value, field, errors) {
  const text = firstText(value).trim()
  if (!text) return
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text) || text.startsWith('//')) {
    errors.push(error(
      'CUSTOM_TEMPLATE_PATH_INVALID',
      field,
      `${field} must be a relative API path.`,
      'Put the host in Base URL and keep template paths relative, for example /v1/images/generations.'
    ))
  }
}

function extractTemplateVariables(value) {
  const variables = []
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}|\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g
  let match
  while ((match = re.exec(value))) variables.push(match[1] || match[2] || match[3])
  return variables
}

function isJsonPath(value) {
  return /^(?:\$\.?)?(?:[A-Za-z_][A-Za-z0-9_-]*|\[(?:\d+|'[^'\]]+'|"[^"\]]+")\])(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:\d+|'[^'\]]+'|"[^"\]]+")\])*$/.test(value)
}

function nearest(value, allowed) {
  return allowed.reduce((best, current) => (
    Math.abs(current - value) < Math.abs(best - value) ? current : best
  ), allowed[0])
}

function firstText(...values) {
  const value = values.find(v => v !== undefined && v !== null && v !== '')
  return value === undefined ? '' : String(value)
}

function firstDefined(...values) {
  return values.find(v => v !== undefined)
}

function charLength(value) {
  return Array.from(String(value || '')).length
}

function error(code, field, message, suggestion) {
  return { code, field, message, ...(suggestion ? { suggestion } : {}) }
}

function warn(code, field, message) {
  return { code, field, message }
}

function result(errors, warnings, options) {
  return { ok: errors.length === 0, errors, warnings, options }
}

module.exports = {
  validateGenerationRequest,
  validateCustomTemplate,
  extractTemplateVariables,
  ALLOWED_TEMPLATE_VARIABLES
}
