const fs = require('fs')
const https = require('https')
const dns = require('dns').promises
const net = require('net')

const DEFAULT_TIMEOUT = 60000
const DEFAULT_DOWNLOAD_TIMEOUT = 60000
const DEFAULT_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024
const MAX_REDIRECTS = 5

// Hostnames that are always considered internal and must never be reached
// from the main process — blocks SSRF via renderer-supplied URLs even when the
// scheme is HTTPS. Covers literal IP hosts and well-known loopback / metadata
// hostnames. Range checks for numeric IPv4/IPv6 literals are done synchronously;
// a DNS resolution guard rejects hostnames whose A records resolve to private
// ranges (prevents DNS-rebinding-style bypasses).
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'metadata.google.internal', 'metadata',
  '169.254.169.254', '169.254.170.2' // AWS/GCP metadata and Docker-dns
])
const PRIVATE_ADDRESSES = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]
]) PRIVATE_ADDRESSES.addSubnet(network, prefix, 'ipv4')
PRIVATE_ADDRESSES.addAddress('::', 'ipv6')
PRIVATE_ADDRESSES.addAddress('::1', 'ipv6')
PRIVATE_ADDRESSES.addSubnet('fc00::', 7, 'ipv6')
PRIVATE_ADDRESSES.addSubnet('fe80::', 10, 'ipv6')
PRIVATE_ADDRESSES.addSubnet('fec0::', 10, 'ipv6')

function isPrivateHost(host) {
  // Strip surrounding brackets used for IPv6 literals in URLs (e.g. [::1])
  const unbracketed = host.replace(/^\[|]$/g, '')
  if (BLOCKED_HOSTNAMES.has(unbracketed.toLowerCase())) return true
  const ipVersion = net.isIP(unbracketed)
  if (ipVersion === 4) return PRIVATE_ADDRESSES.check(unbracketed, 'ipv4')
  if (ipVersion === 6) return PRIVATE_ADDRESSES.check(unbracketed, 'ipv6')
  return false
}

function createPinnedLookup(addresses) {
  const resolved = addresses.map(({ address, family }) => ({ address, family: Number(family) }))
  return (_hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }
    const opts = typeof options === 'number' ? { family: options } : (options || {})
    const candidates = opts.family ? resolved.filter(item => item.family === Number(opts.family)) : resolved
    if (!candidates.length) {
      callback(new Error(`No resolved address for requested family ${opts.family}`))
      return
    }
    if (opts.all) callback(null, candidates)
    else callback(null, candidates[0].address, candidates[0].family)
  }
}

async function resolveSafeHttpsTarget(urlStr) {
  const parsed = assertHttpsUrl(urlStr)
  const hostname = parsed.hostname.replace(/^\[|]$/g, '')
  if (net.isIP(hostname) !== 0) return { url: parsed, lookup: undefined }

  const addrs = await dns.lookup(hostname, { all: true, verbatim: true })
  if (!Array.isArray(addrs) || addrs.length === 0) throw new Error('Host did not resolve to an address')
  for (const { address } of addrs) {
    if (isPrivateHost(address)) {
      throw new Error(`Blocked private/internal resolved address: ${address}`)
    }
  }
  return { url: parsed, lookup: createPinnedLookup(addrs) }
}

function parseUrl(urlStr) {
  try {
    return urlStr instanceof URL ? urlStr : new URL(urlStr)
  } catch {
    throw new Error('Invalid URL')
  }
}

function assertHttpsUrl(urlStr) {
  const parsed = parseUrl(urlStr)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed')
  }
  if (!parsed.hostname) {
    throw new Error('Invalid URL host')
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed')
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`Blocked private/internal host: ${parsed.hostname}`)
  }
  return parsed
}

function assertApiBaseUrl(urlStr) {
  const parsed = assertHttpsUrl(urlStr)
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  return parsed
}

function joinApiUrl(baseUrl, path) {
  const base = assertApiBaseUrl(baseUrl)
  return new URL(`${base.href.replace(/\/$/, '')}${path}`)
}

function cleanRelativeApiPath(path, label = 'API path') {
  const value = String(path || '').trim()
  if (!value) return '/'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//')) {
    throw new Error(`${label} must be a relative API path`)
  }
  if (/[\\\r\n]/.test(value)) throw new Error(`Invalid ${label}`)
  return value.startsWith('/') ? value : `/${value}`
}

function dedupeApiPath(base, path) {
  const baseParts = base.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  const pathParts = cleanRelativeApiPath(path).split('/').filter(Boolean)
  if (!baseParts.length || !pathParts.length) return cleanRelativeApiPath(path)

  let overlap = 0
  for (let i = Math.min(baseParts.length, pathParts.length); i > 0; i -= 1) {
    if (baseParts.slice(-i).join('/').toLowerCase() === pathParts.slice(0, i).join('/').toLowerCase()) {
      overlap = i
      break
    }
  }
  if (!overlap) return `/${pathParts.join('/')}`
  const remaining = pathParts.slice(overlap).join('/')
  return remaining ? `/${remaining}` : '/'
}

function joinCompatibleApiUrl(baseUrl, path) {
  const base = assertApiBaseUrl(baseUrl)
  return new URL(`${base.href.replace(/\/$/, '')}${dedupeApiPath(base, path)}`)
}

function assertSameOriginRedirect(currentUrl, nextUrl) {
  if (currentUrl.origin !== nextUrl.origin) {
    throw new Error('Redirects to a different origin are not allowed')
  }
}

async function downloadToFile(url, filePath, options = {}, depth = 0) {
  if (depth > MAX_REDIRECTS) throw new Error('Too many redirects')
  const target = await resolveSafeHttpsTarget(url)
  const parsed = target.url
  const timeout = options.timeout || DEFAULT_DOWNLOAD_TIMEOUT
  const maxBytes = options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES
  const tmpFile = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    let settled = false
    let written = 0
    let file = null
    let deadline = null

    const cleanup = () => {
      if (deadline) clearTimeout(deadline)
      if (file) file.destroy()
      fs.unlink(tmpFile, () => {})
    }
    const fail = (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const req = https.get(parsed, { timeout, lookup: target.lookup }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        let nextUrl
        try {
          nextUrl = new URL(res.headers.location, parsed).href
        } catch {
          return fail(new Error('Invalid URL'))
        }
        settled = true
        if (deadline) clearTimeout(deadline)
        return downloadToFile(nextUrl, filePath, options, depth + 1).then(resolve, reject)
      }

      if (res.statusCode !== 200) {
        res.resume()
        return fail(new Error(`HTTP ${res.statusCode}`))
      }

      const contentLength = Number(res.headers['content-length'])
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        res.resume()
        return fail(new Error('Download is too large'))
      }

      file = fs.createWriteStream(tmpFile)
      res.on('data', (chunk) => {
        written += chunk.length
        if (written > maxBytes) {
          req.destroy(new Error('Download is too large'))
        }
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          if (!settled) {
            settled = true
            if (deadline) clearTimeout(deadline)
            fs.rename(tmpFile, filePath, (err) => {
              if (err) {
                fs.unlink(tmpFile, () => {})
                reject(err)
                return
              }
              resolve()
            })
          }
        })
      })
      file.on('error', fail)
    })

    req.on('timeout', () => req.destroy(new Error(`Download timed out after ${timeout}ms`)))
    req.on('error', fail)
    deadline = setTimeout(() => req.destroy(new Error(`Download timed out after ${timeout}ms`)), timeout)
  })
}

async function httpRequest(url, options = {}, body = null, depth = 0) {
  if (depth > MAX_REDIRECTS) throw new Error('Too many redirects')
  const timeout = options.timeout || DEFAULT_TIMEOUT
  const maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES
  const target = await resolveSafeHttpsTarget(url)
  const parsedUrl = target.url
  const requestOptions = {
    method: options.method,
    headers: options.headers,
    timeout,
    lookup: target.lookup
  }
  return new Promise((resolve, reject) => {
    const req = https.request(parsedUrl, requestOptions, (res) => {
      const collectResponse = () => {
        let data = ''
        let bytes = 0
        res.on('data', chunk => {
          bytes += chunk.length
          if (bytes > maxResponseBytes) {
            req.destroy(new Error('Response is too large'))
            return
          }
          data += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }))
      }

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl
        try {
          nextUrl = new URL(res.headers.location, parsedUrl)
          assertSameOriginRedirect(parsedUrl, nextUrl)
        } catch {
          res.resume()
          reject(nextUrl ? new Error('Redirects to a different origin are not allowed') : new Error('Invalid URL'))
          return
        }
        res.resume()
        httpRequest(nextUrl, options, body, depth + 1).then(resolve, reject)
        return
      }

      collectResponse()
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeout}ms`))
    })
    if (body != null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body))
    }
    req.end()
  })
}

async function request(url, options = {}, body = null, { retries = 0, retryDelay = 2000 } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await httpRequest(url, options, body)
      if (res.status >= 400) {
        let detail = ''
        try {
          const json = JSON.parse(res.data)
          detail = json.error?.message || json.message || ''
        } catch {}
        throw new HttpError(res.status, detail, res.headers)
      }
      return res
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, retryDelay))
    }
  }
  throw lastErr
}

class HttpError extends Error {
  constructor(status, detail = '', headers = {}) {
    const normalizedStatus = Number(status) || 0
    const normalizedDetail = String(detail || '').trim()
    super(`HTTP ${normalizedStatus}${normalizedDetail ? `: ${normalizedDetail}` : ''}`)
    this.name = 'HttpError'
    this.status = normalizedStatus
    this.statusCode = normalizedStatus
    this.code = normalizedStatus ? `HTTP_${normalizedStatus}` : 'HTTP_ERROR'
    this.response = { status: normalizedStatus, headers }
  }
}

module.exports = { HttpError, httpRequest, request, assertHttpsUrl, assertApiBaseUrl, joinApiUrl, joinCompatibleApiUrl, cleanRelativeApiPath, downloadToFile, _test: { cleanRelativeApiPath, createPinnedLookup, dedupeApiPath } }
