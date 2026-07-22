import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { HttpError } = require('../electron/api/http')
const {
  beginDeviceCodeAttempt,
  cancelOAuthAttempt,
  createOAuthAttempt,
  oauthAttempts,
  refreshOAuthCredential
} = require('../electron/providers/connections')

function disposeAttempts() {
  for (const attempt of oauthAttempts.values()) {
    if (attempt.expiryTimer) clearTimeout(attempt.expiryTimer)
    if (attempt.pollTimer) clearTimeout(attempt.pollTimer)
    if (attempt.cleanupTimer) clearTimeout(attempt.cleanupTimer)
    attempt.server?.close()
  }
  oauthAttempts.clear()
}

test.afterEach(disposeAttempts)

test('HttpError retains a machine-readable HTTP status', () => {
  const error = new HttpError(401, 'credential expired', { 'retry-after': '1' })
  assert.equal(error.status, 401)
  assert.equal(error.statusCode, 401)
  assert.equal(error.code, 'HTTP_401')
  assert.match(error.message, /^HTTP 401:/)
  assert.equal(error.response.status, 401)
})

test('a newer attempt supersedes every active attempt for the connector', () => {
  const first = createOAuthAttempt('same-connector')
  const second = createOAuthAttempt('same-connector')

  assert.equal(first.status, 'cancelled')
  assert.equal(first.errorCode, 'OAUTH_SUPERSEDED')
  assert.equal(second.status, 'pending')
})

test('cancelling during device authorization prevents polling and persistence', async () => {
  const prefix = 'GRAVURESSE_TEST_DEVICE_CANCEL'
  process.env[`${prefix}_CLIENT_ID`] = 'gravuresse-test'
  process.env[`${prefix}_DEVICE_URL`] = 'https://auth.example.test/device'
  process.env[`${prefix}_TOKEN_URL`] = 'https://auth.example.test/token'

  let resolveDevice
  let requests = 0
  let persisted = false
  const pending = beginDeviceCodeAttempt({
    id: 'test-device-cancel', providerId: 'test', mode: 'device-code', envPrefix: prefix
  }, {
    requestFn: async () => {
      requests += 1
      return new Promise(resolve => { resolveDevice = resolve })
    },
    persistAccount: async () => { persisted = true }
  })

  await new Promise(resolve => setImmediate(resolve))
  const attempt = [...oauthAttempts.values()][0]
  assert.equal(cancelOAuthAttempt(attempt.id), true)
  resolveDevice({ data: JSON.stringify({
    device_code: 'secret-device-code', user_code: 'ABCD-EFGH',
    verification_uri: 'https://auth.example.test/verify', interval: 5
  }) })

  const result = await pending
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(result.status, 'cancelled')
  assert.equal(requests, 1)
  assert.equal(persisted, false)
})

test('provider OAuth error descriptions are not reflected to callers', async () => {
  const leaked = 'upstream-secret-access-token'
  const connector = { id: 'refresh-test' }
  await assert.rejects(
    refreshOAuthCredential(connector, 'refresh-secret', {
      configuration: {
        tokenUrl: 'https://auth.example.test/token', clientId: 'gravuresse-test', clientSecret: 'client-secret'
      },
      requestFn: async () => ({ data: JSON.stringify({ error: 'invalid_grant', error_description: leaked }) })
    }),
    error => {
      assert.doesNotMatch(error.message, new RegExp(leaked))
      assert.equal(error.message, 'OAuth credential refresh was rejected by the provider (invalid_grant)')
      return true
    }
  )
})

test('OAuth network errors retain status without reflecting response text', async () => {
  const leaked = 'token-in-http-error-body'
  await assert.rejects(
    refreshOAuthCredential({ id: 'refresh-http-test' }, 'refresh-secret', {
      configuration: { tokenUrl: 'https://auth.example.test/token', clientId: 'gravuresse-test' },
      requestFn: async () => { throw new HttpError(401, leaked) }
    }),
    error => {
      assert.equal(error.status, 401)
      assert.equal(error.code, 'HTTP_401')
      assert.equal(error.message, 'OAuth credential refresh request failed')
      assert.doesNotMatch(error.message, new RegExp(leaked))
      return true
    }
  )
})

test('malformed device responses do not reflect upstream descriptions', async () => {
  const prefix = 'GRAVURESSE_TEST_DEVICE_ERROR'
  process.env[`${prefix}_CLIENT_ID`] = 'gravuresse-test'
  process.env[`${prefix}_DEVICE_URL`] = 'https://auth.example.test/device'
  process.env[`${prefix}_TOKEN_URL`] = 'https://auth.example.test/token'
  const leaked = 'device-secret-from-upstream'

  const result = await beginDeviceCodeAttempt({
    id: 'test-device-error', providerId: 'test', mode: 'device-code', envPrefix: prefix
  }, {
    requestFn: async () => ({ data: JSON.stringify({ error: 'invalid_request', error_description: leaked }) })
  })

  assert.equal(result.status, 'error')
  assert.equal(result.message, 'Device authorization failed')
  assert.doesNotMatch(result.message, new RegExp(leaked))
})
