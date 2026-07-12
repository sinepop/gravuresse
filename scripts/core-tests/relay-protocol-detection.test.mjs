import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectRelayProtocol, normalizeRelayBaseUrl, sameRelayEndpoint } = require('../../electron/providers/connections.js')
const { _test: ipcTest } = require('../../electron/ipc/provider-connections.js')
const { providerConfigFromConnection } = require('../../electron/providers/config-resolver.js')

function response(data) {
  return { status: 200, data: JSON.stringify(data), headers: {} }
}

test('relay detection verifies OpenAI protocol and preserves only explicit media capabilities', async () => {
  const calls = []
  const result = await detectRelayProtocol({
    baseUrl: 'https://relay.example.com/v1',
    apiKey: 'secret',
    requestFn: async (url, options, body) => {
      calls.push({ url: url.href, options, body })
      if (options.method === 'GET') return response({ data: [
        { id: 'chat-model' },
        { id: 'flux-by-name-only' },
        { id: 'actual-image', output_modalities: ['image'] }
      ] })
      return response({ choices: [{ message: { content: 'ok' } }] })
    }
  })
  assert.equal(result.detectedProtocol, 'openai')
  assert.equal(calls[0].url, 'https://relay.example.com/v1/models')
  assert.equal(calls[1].url, 'https://relay.example.com/v1/chat/completions')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret')
  assert.equal(calls[0].options.headers.Accept, 'application/json')
  assert.equal(calls[0].options.headers['User-Agent'], 'Gravuresse/2.4.0')
  assert.equal(calls[1].body.messages[0].content, 'Reply only with OK')
  assert.equal(calls[1].body.max_tokens, 16)
  assert.equal(result.validation.evidence, 'assistant_output')
  assert.equal(result.validation.outputVerified, true)
  assert.equal(result.models.find(model => model.id === 'flux-by-name-only').capability, 'unknown')
  assert.equal(result.models.find(model => model.id === 'actual-image').capability, 'image')
})

test('relay detection accepts a valid truncated response without claiming assistant output', async () => {
  const result = await detectRelayProtocol({
    baseUrl: 'https://relay.example.com', apiKey: 'secret',
    requestFn: async (_url, options) => options.method === 'GET'
      ? response({ data: [{ id: 'deepseek-reasoner' }] })
      : response({
          choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
          usage: { completion_tokens: 16 }
        })
  })
  assert.equal(result.validation.status, 'verified')
  assert.equal(result.validation.level, 'minimal_inference')
  assert.equal(result.validation.evidence, 'protocol_response')
  assert.equal(result.validation.outputVerified, false)
})

test('directory-only relay discovery accepts a pure OpenAI-compatible image inventory', async () => {
  let postCalls = 0
  const result = await detectRelayProtocol({
    baseUrl: 'https://image-relay.example.com/v1', apiKey: 'secret', requireInference: false,
    requestFn: async (_url, options) => {
      if (options.method === 'POST') postCalls += 1
      return response({ data: [{ id: 'gpt-image-1' }, { id: 'flux-1.1-pro' }] })
    }
  })
  assert.equal(postCalls, 0)
  assert.equal(result.detectedProtocol, 'openai')
  assert.equal(result.validation.status, 'directory_verified')
  assert.equal(result.validation.evidence, 'model_directory')
  assert.equal(result.detectedEndpoints.image, '/v1/images/generations')
  assert.equal(result.detectedEndpoints.chat, undefined)
  assert.deepEqual(result.models.map(model => model.capability), ['image', 'image'])
})

test('directory-only relay discovery keeps video models without inventing an execution endpoint', async () => {
  const result = await detectRelayProtocol({
    baseUrl: 'https://video-relay.example.com/v1', apiKey: 'secret', requireInference: false,
    requestFn: async () => response({ data: [{ id: 'sora-2' }] })
  })
  assert.equal(result.validation.status, 'directory_verified')
  assert.equal(result.models[0].capability, 'video')
  assert.deepEqual(result.detectedEndpoints, { models: '/v1/models' })
})

test('relay detection never accepts a non-2xx transport response', async () => {
  await assert.rejects(() => detectRelayProtocol({
    baseUrl: 'https://relay.example.com', apiKey: 'secret',
    requestFn: async (_url, options) => ({
      status: 302,
      data: JSON.stringify(options.method === 'GET'
        ? { data: [{ id: 'chat-model' }] }
        : { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] })
    })
  }), error => error?.failures?.every(failure => failure.statusCode === 302))
})

test('relay detection falls through to Anthropic and Gemini with protocol-specific auth', async () => {
  const anthropicCalls = []
  const anthropic = await detectRelayProtocol({
    baseUrl: 'https://anthropic-relay.example.com', apiKey: 'anthropic-key',
    requestFn: async (url, options) => {
      anthropicCalls.push({ url: url.href, headers: options.headers })
      if (options.headers.Authorization) throw new Error('HTTP 401')
      if (options.method === 'GET') return response({ data: [{ id: 'claude-relay' }] })
      return response({ content: [{ type: 'text', text: 'ok' }] })
    }
  })
  assert.equal(anthropic.detectedProtocol, 'anthropic')
  assert.equal(anthropicCalls.at(-1).headers['x-api-key'], 'anthropic-key')
  assert.equal(anthropicCalls.at(-1).headers['anthropic-version'], '2023-06-01')

  const geminiCalls = []
  const gemini = await detectRelayProtocol({
    baseUrl: 'https://gemini-relay.example.com', apiKey: 'gemini-key',
    requestFn: async (url, options) => {
      geminiCalls.push({ url: url.href, headers: options.headers })
      if (options.headers.Authorization || options.headers['x-api-key']) throw new Error('HTTP 401')
      if (options.method === 'GET') return response({ models: [{ name: 'models/gemini-relay' }] })
      return response({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
    }
  })
  assert.equal(gemini.detectedProtocol, 'gemini')
  assert.match(geminiCalls.at(-1).url, /key=gemini-key/)
})

test('relay detection errors do not reflect upstream response text', async () => {
  await assert.rejects(
    detectRelayProtocol({
      baseUrl: 'https://relay.example.com', apiKey: 'secret',
      requestFn: async () => { throw Object.assign(new Error('HTTP 401: private upstream explanation'), { status: 401 }) }
    }),
    error => {
      assert.match(error.message, /HTTP 401/)
      assert.doesNotMatch(error.message, /private upstream explanation/)
      assert.equal(error.code, 'RELAY_PROTOCOL_NOT_DETECTED')
      assert.deepEqual(error.failures.map(({ protocol, stage, statusCode, endpointHost, endpointPath, errorCode, message }) => ({ protocol, stage, statusCode, endpointHost, endpointPath, errorCode, message })), [
        { protocol: 'openai', stage: 'directory', statusCode: 401, endpointHost: 'relay.example.com', endpointPath: '/v1/models', errorCode: 'HTTP_401', message: 'HTTP 401' },
        { protocol: 'anthropic', stage: 'directory', statusCode: 401, endpointHost: 'relay.example.com', endpointPath: '/v1/models', errorCode: 'HTTP_401', message: 'HTTP 401' },
        { protocol: 'gemini', stage: 'directory', statusCode: 401, endpointHost: 'relay.example.com', endpointPath: '/v1beta/models', errorCode: 'HTTP_401', message: 'HTTP 401' }
      ])
      assert.ok(error.failures.every(item => /^\d{4}-\d{2}-\d{2}T/.test(item.checkedAt)))
      return true
    }
  )
})

test('full relay endpoint URLs normalize to a canonical credential boundary', () => {
  assert.equal(normalizeRelayBaseUrl('https://Relay.Example.com:443/api/v1/models?key=discarded#fragment'), 'https://relay.example.com/api/v1')
  assert.equal(normalizeRelayBaseUrl('https://relay.example.com/api/v1/chat/completions/'), 'https://relay.example.com/api/v1')
  assert.equal(normalizeRelayBaseUrl('https://relay.example.com/api/v1/messages'), 'https://relay.example.com/api/v1')
  assert.equal(normalizeRelayBaseUrl('https://relay.example.com/api/v1/responses'), 'https://relay.example.com/api/v1')
  assert.equal(normalizeRelayBaseUrl('https://relay.example.com/api/v1beta/models/gemini-pro:generateContent?key=discarded'), 'https://relay.example.com/api/v1beta')
  assert.equal(sameRelayEndpoint('https://relay.example.com/api/v1/', 'https://RELAY.example.com:443/api/v1/models?x=1'), true)
  assert.equal(sameRelayEndpoint('https://relay.example.com/api/v1', 'https://other.example.com/api/v1/models'), false)
})

test('relay detection attempts at most six text candidates', async () => {
  let inferenceCalls = 0
  const result = await detectRelayProtocol({
    baseUrl: 'https://relay.example.com/v1/models?ignored=true', apiKey: 'secret',
    requestFn: async (_url, options) => {
      if (options.method === 'GET') return response({ data: Array.from({ length: 8 }, (_, index) => ({ id: `unknown-${index + 1}` })) })
      inferenceCalls += 1
      if (inferenceCalls < 6) throw new Error('temporary model mismatch')
      return response({ choices: [{ message: { content: 'ok' } }] })
    }
  })
  assert.equal(result.validation.modelId, 'unknown-6')
  assert.equal(inferenceCalls, 6)
})

test('relay detection skips obvious non-text candidates without classifying them as media', async () => {
  const attempted = []
  const result = await detectRelayProtocol({
    baseUrl: 'https://relay.example.com/v1', apiKey: 'secret',
    requestFn: async (_url, options, body) => {
      if (options.method === 'GET') return response({ data: [
        { id: 'text-embedding-3-large' }, { id: 'vendor-rerank-v2' }, { id: 'whisper-audio' }, { id: 'working-chat' }
      ] })
      attempted.push(body.model)
      return response({ choices: [{ message: { content: 'ok' } }] })
    }
  })
  assert.deepEqual(attempted, ['working-chat'])
  assert.equal(result.validation.modelId, 'working-chat')
  assert.ok(!['chat', 'image', 'video'].includes(result.models.find(model => model.id === 'text-embedding-3-large').capability))
})

test('relay detection probes an ambiguous non-media model before declaring no text candidates', async () => {
  const attempted = []
  const result = await detectRelayProtocol({
    baseUrl: 'https://relay.example.com/v1', apiKey: 'secret',
    requestFn: async (_url, options, body) => {
      if (options.method === 'GET') return response({ data: [
        { id: 'vendor-coding-pro', type: 'model', description: 'Supports text and audio input' },
        { id: 'vendor-embedding', type: 'embedding' },
        { id: 'vendor-visual', output_modalities: ['image'] },
        { id: 'vendor-motion', capabilities: { textToVideo: true } }
      ] })
      attempted.push(body.model)
      return response({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] })
    }
  })
  assert.deepEqual(attempted, ['vendor-coding-pro'])
  assert.equal(result.validation.modelId, 'vendor-coding-pro')
  assert.equal(result.models.find(model => model.id === 'vendor-coding-pro').capability, 'chat')
})

test('zero safe text candidates reports inference selection instead of directory failure', async () => {
  await assert.rejects(() => detectRelayProtocol({
    baseUrl: 'https://relay.example.com/v1', apiKey: 'secret',
    requestFn: async () => response({ data: [{ id: 'text-embedding-3-large' }, { id: 'vendor-rerank-v2' }] })
  }), error => {
    const failure = error?.failures?.[0]
    assert.equal(failure?.stage, 'inference')
    assert.equal(failure?.endpointPath, '/v1/chat/completions')
    assert.equal(failure?.errorCode, 'NO_TEXT_MODEL_CANDIDATE')
    assert.match(failure?.message || '', /2 directory models/)
    return true
  })
})

test('failed relay detection leaves an existing usable relay unchanged', async () => {
  const existing = {
    id: 'relay-one', kind: 'relay', providerId: 'custom-relay', baseUrl: 'https://old.example.com/v1',
    apiKey: 'old-secret', revision: 'old-revision', models: [{ id: 'old-model', capability: 'chat', source: 'remote' }],
    validation: { ok: true, status: 'verified' }, validations: { chat: { ok: true, status: 'verified' } }
  }
  let state = { connections: { accounts: [], apiKeys: [], relays: [existing], defaults: {} } }
  const config = {
    REDACTED_API_KEY: '********',
    load: () => structuredClone(state),
    update: async mutator => { state = structuredClone(mutator(structuredClone(state))); return structuredClone(state) },
    redactApiKeys: value => {
      const copy = structuredClone(value)
      for (const connection of copy.connections?.apiKeys || []) if (connection.apiKey) connection.apiKey = '********'
      return copy
    }
  }
  const result = await ipcTest.saveDetectedRelay({
    params: { connection: { id: 'relay-one', baseUrl: 'https://new.example.com/v1', apiKey: 'new-secret', detectedProtocol: 'forged' } },
    config,
    relayDetector: async () => {
      throw Object.assign(new Error('No supported relay protocol was verified'), {
        code: 'RELAY_PROTOCOL_NOT_DETECTED',
        failures: [{ protocol: 'openai', errorCode: 'HTTP_403', message: 'HTTP 403 new-secret' }]
      })
    }
  })
  assert.equal(result.detectionResult.ok, false)
  assert.equal(result.detectionResult.errorCode, 'HTTP_403')
  assert.deepEqual(result.detectionResult.failures, [{
    protocol: 'openai', stage: 'directory', statusCode: null, endpointHost: '', endpointPath: '',
    checkedAt: result.detectionResult.checkedAt, errorCode: 'HTTP_403', message: 'HTTP 403 [redacted]'
  }])
  assert.deepEqual(state.connections.relays[0], existing)

  let recoveredKey = ''
  const sameEndpoint = await ipcTest.saveDetectedRelay({
    params: { connection: { id: 'relay-one', baseUrl: 'https://OLD.example.com:443/v1/models?ignored=true', apiKey: '********' } },
    config,
    relayDetector: async ({ apiKey }) => {
      recoveredKey = apiKey
      throw new Error('probe stopped for test')
    }
  })
  assert.equal(recoveredKey, 'old-secret', 'masked credentials are recoverable only for the same stored endpoint')
  assert.equal(sameEndpoint.detectionResult.ok, false)

  recoveredKey = 'not-called'
  await ipcTest.saveDetectedRelay({
    params: { connection: { id: 'relay-one', baseUrl: 'https://other.example.com/v1', apiKey: '********' } },
    config,
    relayDetector: async ({ apiKey }) => { recoveredKey = apiKey; throw new Error('probe stopped for test') }
  })
  assert.equal(recoveredKey, '', 'masked credentials are never paired with another endpoint')
})

test('relay protocol is committed from main-process detection, not renderer fields', async () => {
  let state = { connections: { accounts: [], apiKeys: [], relays: [], defaults: {} } }
  const config = {
    REDACTED_API_KEY: '********',
    load: () => structuredClone(state),
    update: async mutator => { state = structuredClone(mutator(structuredClone(state))); return structuredClone(state) },
    redactApiKeys: value => {
      const copy = structuredClone(value)
      for (const connection of copy.connections?.apiKeys || []) if (connection.apiKey) connection.apiKey = '********'
      return copy
    }
  }
  await ipcTest.saveDetectedRelay({
    params: { connection: { id: 'relay-one', baseUrl: 'https://relay.example.com/v1', apiKey: 'secret', detectedProtocol: 'forged', capabilities: ['video'] } },
    config,
    relayDetector: async () => ({
      detectedProtocol: 'anthropic', detectedAt: '2026-07-11T00:00:00.000Z',
      detectedEndpoints: { models: '/v1/models', chat: '/v1/messages' }, detectionRevision: 'main-revision',
      authType: { type: 'header', key: 'x-api-key' }, models: [{ id: 'claude', capability: 'chat', source: 'remote' }],
      validation: { ok: true, status: 'verified', level: 'minimal_inference', checkedAt: '2026-07-11T00:00:00.000Z', latencyMs: 1, endpointHost: 'relay.example.com', modelId: 'claude', errorCode: '', message: 'verified' }
    })
  })
  assert.equal(state.connections.relays[0].detectedProtocol, 'anthropic')
  assert.deepEqual(state.connections.relays[0].capabilities, ['chat'])
  assert.equal(state.connections.relays[0].revision, 'main-revision')
  const runtime = providerConfigFromConnection(state.connections.relays[0], 'chat', 'claude')
  assert.equal(runtime.providerId, 'anthropic')
  assert.equal(runtime.path, '/v1/messages')
  assert.equal(runtime.modelListPath, '/v1/models')
})
