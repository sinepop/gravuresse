const { registerHandler } = require('../handler')
const { request, joinCompatibleApiUrl } = require('../../api/http')
const { extractPrimaryInferenceOutput } = require('../inference-evidence')

async function anthropicHandler(params) {
  const payload = {
    model: params.model,
    max_tokens: 16000,
    system: params.system,
    messages: params.messages || []
  }

  if (params.thinking) {
    payload.thinking = { type: 'enabled', budget_tokens: 10000 }
    payload.max_tokens = 20000
  }

  const url = joinCompatibleApiUrl(params.baseUrl, params.path || '/v1/messages')
  const res = await request(url, {
    method: 'POST',
    headers: {
      ...params.auth.headers,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    ...(params.requestOptions || {})
  }, payload)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)

  const output = extractPrimaryInferenceOutput('anthropic', json)
  return { ...output, model: json.model }
}

registerHandler('anthropic', anthropicHandler)
module.exports = anthropicHandler
