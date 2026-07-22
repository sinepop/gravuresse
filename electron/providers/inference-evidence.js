const MINIMAL_INFERENCE_PROMPT = 'Reply only with OK'
const MINIMAL_INFERENCE_TOKENS = 16

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasNumericUsage(value, keys) {
  return isObject(value) && keys.some(key => Number.isFinite(value[key]) && value[key] > 0)
}

const OPENAI_FINISH_REASONS = new Set(['stop', 'length', 'content_filter', 'tool_calls', 'function_call'])
const ANTHROPIC_STOP_REASONS = new Set(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal'])
const GEMINI_FINISH_REASONS = new Set(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'NO_IMAGE'])

function textFromValue(value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map(item => {
    if (typeof item === 'string') return item
    if (!isObject(item)) return ''
    return typeof item.text === 'string'
      ? item.text
      : typeof item.content === 'string'
        ? item.content
        : ''
  }).join('')
}

function inferenceProtocol(value) {
  const protocol = String(value || '').toLowerCase()
  if (protocol === 'google' || protocol === 'gemini') return 'gemini'
  if (protocol === 'anthropic' || protocol === 'claude') return 'anthropic'
  return 'openai'
}

function parseInferenceJson(value) {
  if (isObject(value)) return value
  try {
    const parsed = JSON.parse(String(value || ''))
    if (isObject(parsed)) return parsed
  } catch {}
  throw new Error('Minimal inference returned invalid JSON')
}

function assertSuccessfulResponse(response) {
  const status = Number(response?.status)
  if (Number.isFinite(status) && (status < 200 || status >= 300)) {
    const error = new Error(`HTTP ${status}: validation request was not successful`)
    error.status = status
    error.code = `HTTP_${status}`
    throw error
  }
  return response
}

function analyzeOpenAi(json) {
  const choices = Array.isArray(json.choices) ? json.choices : []
  const messages = choices.map(choice => choice?.message).filter(isObject)
  const text = messages.map(message => textFromValue(message.content)).join('')
  const thinking = messages.map(message => textFromValue(message.reasoning_content)).join('')
  const hasProtocolEnvelope = messages.length > 0 && (
    choices.some(choice => OPENAI_FINISH_REASONS.has(choice?.finish_reason)) ||
    hasNumericUsage(json.usage, ['prompt_tokens', 'completion_tokens', 'total_tokens'])
  )
  return { text, thinking, hasProtocolEnvelope }
}

function analyzeAnthropic(json) {
  const content = Array.isArray(json.content) ? json.content : []
  const text = content.filter(item => item?.type !== 'thinking').map(item => textFromValue(item?.text)).join('')
  const thinking = content.filter(item => item?.type === 'thinking')
    .map(item => textFromValue(item?.thinking ?? item?.text)).join('')
  const hasProtocolEnvelope = Array.isArray(json.content) && (
    ANTHROPIC_STOP_REASONS.has(json.stop_reason) ||
    hasNumericUsage(json.usage, ['input_tokens', 'output_tokens'])
  )
  return { text, thinking, hasProtocolEnvelope }
}

function analyzeGemini(json) {
  const candidates = Array.isArray(json.candidates) ? json.candidates : []
  const text = candidates.flatMap(candidate => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map(part => textFromValue(part?.text)).join('')
  const hasProtocolEnvelope = candidates.length > 0 && (
    candidates.some(candidate => GEMINI_FINISH_REASONS.has(candidate?.finishReason)) ||
    hasNumericUsage(json.usageMetadata, ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount'])
  )
  return { text, thinking: '', hasProtocolEnvelope }
}

function extractPrimaryInferenceOutput(protocol, value) {
  const json = parseInferenceJson(value)
  if (json.error) throw new Error('Inference returned an error response')
  const normalized = inferenceProtocol(protocol)
  if (normalized === 'anthropic') {
    const content = Array.isArray(json.content) ? json.content : []
    return {
      text: content.filter(item => item?.type !== 'thinking').map(item => textFromValue(item?.text)).join(''),
      thinking: content.filter(item => item?.type === 'thinking').map(item => textFromValue(item?.thinking ?? item?.text)).join('')
    }
  }
  if (normalized === 'gemini') {
    const parts = Array.isArray(json.candidates?.[0]?.content?.parts) ? json.candidates[0].content.parts : []
    return { text: parts.map(part => textFromValue(part?.text)).join(''), thinking: '' }
  }
  const message = isObject(json.choices?.[0]?.message) ? json.choices[0].message : {}
  return { text: textFromValue(message.content), thinking: textFromValue(message.reasoning_content) }
}

function analyzeInferenceResponse(protocol, value) {
  const json = parseInferenceJson(value)
  if (json.error) throw new Error('Minimal inference returned an error response')
  const normalized = inferenceProtocol(protocol)
  const result = normalized === 'anthropic'
    ? analyzeAnthropic(json)
    : normalized === 'gemini'
      ? analyzeGemini(json)
      : analyzeOpenAi(json)
  const outputVerified = Boolean(result.text.trim() || result.thinking.trim())
  if (!outputVerified && !result.hasProtocolEnvelope) {
    throw new Error('Minimal inference returned no valid protocol response')
  }
  return {
    evidence: outputVerified ? 'assistant_output' : 'protocol_response',
    outputVerified,
    text: result.text,
    thinking: result.thinking
  }
}

function buildMinimalInferenceBody(protocol, model) {
  const normalized = inferenceProtocol(protocol)
  if (normalized === 'gemini') {
    return {
      contents: [{ role: 'user', parts: [{ text: MINIMAL_INFERENCE_PROMPT }] }],
      generationConfig: { maxOutputTokens: MINIMAL_INFERENCE_TOKENS }
    }
  }
  return {
    model,
    messages: [{ role: 'user', content: MINIMAL_INFERENCE_PROMPT }],
    max_tokens: MINIMAL_INFERENCE_TOKENS
  }
}

module.exports = {
  MINIMAL_INFERENCE_PROMPT,
  MINIMAL_INFERENCE_TOKENS,
  assertSuccessfulResponse,
  analyzeInferenceResponse,
  extractPrimaryInferenceOutput,
  buildMinimalInferenceBody,
  inferenceProtocol,
  textFromValue
}
