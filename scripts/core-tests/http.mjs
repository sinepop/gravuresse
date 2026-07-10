import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import https from 'node:https'
import dns from 'node:dns'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { assertHttpsUrl, httpRequest, joinCompatibleApiUrl } = require('../../electron/api/http.js')

function installMockHttps(routes) {
  const originalRequest = https.request
  const calls = []
  https.request = (url, options, callback) => {
    calls.push({ url: url.href, options })
    const req = new EventEmitter()
    req.write = () => {}
    req.end = () => {
      queueMicrotask(() => {
        const route = routes[url.pathname] || routes.default
        if (route instanceof Error) {
          req.emit('error', route)
          return
        }
        const res = new EventEmitter()
        res.statusCode = route.status
        res.headers = route.headers || {}
        res.resume = () => {}
        callback(res)
        if (route.body) res.emit('data', Buffer.from(route.body))
        res.emit('end')
      })
    }
    req.destroy = (error) => {
      if (error) req.emit('error', error)
    }
    req.setTimeout = () => req
    return req
  }
  return {
    calls,
    restore() {
      https.request = originalRequest
    }
  }
}

function installMockDns() {
  const originalLookup = dns.promises.lookup
  const calls = []
  dns.promises.lookup = async (hostname) => {
    calls.push(hostname)
    return [{ address: '93.184.216.35', family: 4 }]
  }
  return {
    calls,
    restore() {
      dns.promises.lookup = originalLookup
    }
  }
}

export async function runHttpCoreTests() {
  assert.equal(
    joinCompatibleApiUrl('https://relay.example.com', '/v1/chat/completions').href,
    'https://relay.example.com/v1/chat/completions'
  )
  assert.equal(
    joinCompatibleApiUrl('https://relay.example.com/v1', '/v1/chat/completions').href,
    'https://relay.example.com/v1/chat/completions'
  )
  assert.equal(
    joinCompatibleApiUrl('https://relay.example.com/api/v1', '/v1/images/generations').href,
    'https://relay.example.com/api/v1/images/generations'
  )
  assert.throws(
    () => joinCompatibleApiUrl('https://relay.example.com', 'https://evil.example.com/v1/models'),
    /relative API path/
  )

  assert.throws(
    () => assertHttpsUrl('https://user:pass@example.com/a.png'),
    /credentials/
  )
  for (const privateUrl of [
    'https://127.0.0.1/private',
    'https://[::1]/private',
    'https://[::ffff:127.0.0.1]/private',
    'https://[::ffff:7f00:1]/private',
    'https://[fc00::1]/private',
    'https://[fe80::1]/private'
  ]) {
    assert.throws(() => assertHttpsUrl(privateUrl), /private\/internal/, privateUrl)
  }

  let mock = installMockHttps({
    '/start': { status: 302, headers: { location: '/final' } },
    '/final': { status: 200, body: '{"ok":true}' }
  })
  try {
    const res = await httpRequest('https://93.184.216.34/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' }
    }, { ping: true })
    assert.equal(res.status, 200)
    assert.equal(res.data, '{"ok":true}')
    assert.deepEqual(mock.calls.map(call => new URL(call.url).pathname), ['/start', '/final'])
    assert.equal(mock.calls[1].options.headers.Authorization, 'Bearer test-token')
  } finally {
    mock.restore()
  }

  mock = installMockHttps({
    '/cross-origin': { status: 302, headers: { location: 'https://93.184.216.35/final' } },
    '/final': { status: 200, body: 'leaked' }
  })
  const dnsMock = installMockDns()
  try {
    await assert.rejects(
      () => httpRequest('https://93.184.216.34/cross-origin', {
        method: 'POST',
        headers: { Authorization: 'Bearer must-not-leak', 'X-Api-Key': 'must-not-leak' }
      }, { secret: true }),
      /different origin/
    )
    assert.deepEqual(mock.calls.map(call => call.url), ['https://93.184.216.34/cross-origin'])
    assert.deepEqual(dnsMock.calls, [])
  } finally {
    dnsMock.restore()
    mock.restore()
  }

  mock = installMockHttps({
    '/bad-scheme': { status: 302, headers: { location: 'http://93.184.216.34/final' } }
  })
  try {
    await assert.rejects(
      () => httpRequest('https://93.184.216.34/bad-scheme'),
      /different origin/
    )
  } finally {
    mock.restore()
  }

  mock = installMockHttps({
    '/private-host': { status: 302, headers: { location: 'https://127.0.0.1/final' } }
  })
  try {
    await assert.rejects(
      () => httpRequest('https://93.184.216.34/private-host'),
      /different origin/
    )
    assert.deepEqual(mock.calls.map(call => call.url), ['https://93.184.216.34/private-host'])
  } finally {
    mock.restore()
  }

  mock = installMockHttps({
    '/pinned': { status: 200, body: '{"pinned":true}' }
  })
  const pinnedDns = installMockDns()
  try {
    const res = await httpRequest('https://relay.example.com/pinned', {
      method: 'GET',
      hostname: '127.0.0.1',
      path: '/metadata',
      lookup: () => { throw new Error('renderer lookup must not run') }
    })
    assert.equal(res.status, 200)
    assert.deepEqual(pinnedDns.calls, ['relay.example.com'])
    assert.equal(mock.calls[0].options.hostname, undefined)
    assert.equal(mock.calls[0].options.path, undefined)
    assert.equal(typeof mock.calls[0].options.lookup, 'function')
    const pinnedAddress = await new Promise((resolve, reject) => {
      mock.calls[0].options.lookup('relay.example.com', {}, (error, address, family) => {
        if (error) reject(error)
        else resolve({ address, family })
      })
    })
    assert.deepEqual(pinnedAddress, { address: '93.184.216.35', family: 4 })
  } finally {
    pinnedDns.restore()
    mock.restore()
  }
}
