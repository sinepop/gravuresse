const { registerHandler } = require('../handler')
const { request, joinApiUrl } = require('../../api/http')

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

  const url = joinApiUrl(params.baseUrl, '/v1/messages')
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

  const thinking = json.content?.filter(block => block.type === 'thinking').map(block => block.text).join('') || ''
  const text = json.content?.filter(block => block.type === 'text').map(block => block.text).join('') || ''
  return { text, thinking, model: json.model }
}

registerHandler('anthropic', anthropicHandler)
module.exports = anthropicHandler
