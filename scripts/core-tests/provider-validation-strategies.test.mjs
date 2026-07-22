import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const {
  REGISTRY,
  VALIDATION_STRATEGIES,
  getValidationStrategy
} = require('../../electron/providers/registry.js')
const { resolveAuth } = require('../../electron/providers/auth.js')
const models = require('../../electron/api/models.js')._test
const { sanitizeConnection } = require('../../electron/providers/connections.js')

const TRACKS = ['chat', 'image', 'video']
const DISPLAYED_STRATEGIES = new Set(Object.values(VALIDATION_STRATEGIES))

function displayedApiKeyProviders() {
  return REGISTRY.filter(provider =>
    !provider.id.startsWith('custom-') &&
    provider.authType?.type !== 'none' &&
    TRACKS.some(track => Boolean(provider[track]))
  )
}

test('every standard provider shown on the API key page has an explicit validation policy', () => {
  const displayed = displayedApiKeyProviders()
  assert.ok(displayed.length > 0)
  for (const provider of displayed) {
    assert.ok(
      DISPLAYED_STRATEGIES.has(provider.validationStrategy),
      `${provider.id} has no supported validation strategy`
    )
    assert.equal(getValidationStrategy(provider.id), provider.validationStrategy)
  }
  assert.equal(getValidationStrategy('missing-provider'), VALIDATION_STRATEGIES.UNSUPPORTED)
})

test('chat protocols map to tested validation strategies and specialized media APIs are explicit', () => {
  assert.equal(getValidationStrategy('deepseek'), VALIDATION_STRATEGIES.OPENAI_CHAT)
  assert.equal(getValidationStrategy('anthropic'), VALIDATION_STRATEGIES.ANTHROPIC_MESSAGES)
  assert.equal(getValidationStrategy('google'), VALIDATION_STRATEGIES.GEMINI_GENERATE_CONTENT)
  assert.equal(getValidationStrategy('runway'), VALIDATION_STRATEGIES.UNSUPPORTED)
})

test('protocol contracts keep paths and credentials in their required locations', () => {
  const secret = 'contract-test-secret'

  const openai = REGISTRY.find(provider => provider.id === 'deepseek')
  const openaiAuth = resolveAuth(openai, { apiKey: secret })
  assert.deepEqual(openaiAuth, { headers: { Authorization: `Bearer ${secret}` }, queryParams: {} })
  assert.equal(models.buildModelListUrl(openai.defaults.baseUrl).pathname, '/v1/models')
  assert.equal(new URL('/v1/chat/completions', openai.defaults.baseUrl).pathname, '/v1/chat/completions')

  const anthropic = REGISTRY.find(provider => provider.id === 'anthropic')
  const anthropicAuth = resolveAuth(anthropic, { apiKey: secret })
  assert.deepEqual(anthropicAuth, { headers: { 'x-api-key': secret }, queryParams: {} })
  assert.equal(models.buildModelListUrl(anthropic.defaults.baseUrl).pathname, '/v1/models')
  assert.equal(new URL('/v1/messages', anthropic.defaults.baseUrl).pathname, '/v1/messages')

  const gemini = REGISTRY.find(provider => provider.id === 'google')
  const geminiAuth = resolveAuth(gemini, { apiKey: secret })
  assert.deepEqual(geminiAuth, { headers: {}, queryParams: { key: secret } })
  const geminiModels = models.buildGeminiModelListUrl(gemini.defaults.baseUrl, geminiAuth.queryParams)
  assert.equal(geminiModels.pathname, '/v1beta/models')
  assert.equal(geminiModels.searchParams.get('key'), secret)
  assert.equal(
    new URL('/v1beta/models/gemini-test:generateContent', gemini.defaults.baseUrl).pathname,
    '/v1beta/models/gemini-test:generateContent'
  )
})

test('renderer-owned connection fields cannot override validation policy', () => {
  const sanitized = sanitizeConnection({
    id: 'key-deepseek-contract',
    providerId: 'deepseek',
    baseUrl: 'https://attacker.invalid',
    apiKey: 'test-key',
    capabilities: ['video'],
    validationStrategy: VALIDATION_STRATEGIES.UNSUPPORTED,
    validation: { ok: true },
    validations: { chat: { ok: true } }
  }, 'apiKeys')

  assert.equal(sanitized.baseUrl, 'https://api.deepseek.com')
  assert.deepEqual(sanitized.capabilities, ['chat'])
  assert.equal(sanitized.validationStrategy, undefined)
  assert.equal(sanitized.validation, null)
  assert.deepEqual(sanitized.validations, {})
  assert.equal(getValidationStrategy(sanitized.providerId), VALIDATION_STRATEGIES.OPENAI_CHAT)
})

test('provider:list publishes a read-only availability summary, not its internal strategy', () => {
  const source = fs.readFileSync(new URL('../../electron/ipc/provider.js', import.meta.url), 'utf8')
  const listHandler = source.slice(source.indexOf("ipcMain.handle('provider:list'"), source.indexOf("ipcMain.handle('provider:test'"))
  assert.ok(listHandler.length > 0)
  assert.match(listHandler, /validationAvailability:\s*validationAvailability\(p\.id, track\)/)
  assert.doesNotMatch(listHandler, /validationStrategy:/)
})
