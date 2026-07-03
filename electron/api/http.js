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

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  if (a === 10) return true                       // 10.0.0.0/8        RFC1918
  if (a === 127) return true                      // 127.0.0.0/8       loopback
  if (a === 0) return true                        // 0.0.0.0/8         "this network"
  if (a === 169 && b === 254) return true          // 169.254.0.0/16    link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12     RFC1918
  if (a === 192 && b === 168) return true          // 192.168.0.0/16    RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10   CGNAT
  return false
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::' || lower === '::ffff:0:0') return true // loopback/unspec
  // stripped to check prefixes that map private/link-local/unique-local zones
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 unique-local
  if (lower.startsWith('fe80')) return true                         // link-local
  if (lower.startsWith('fe90') || lower.startsWith('fea0') || lower.startsWith('feb0')) return true // other link-local
  // IPv4-mapped / IPv4-compatible addresses wrapping a private v4
  const mapped = lower.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped && isPrivateIPv4(mapped[1])) return true
  return false
}

function isPrivateHost(host) {
  // Strip surrounding brackets used for IPv6 literals in URLs (e.g. [::1])
  const unbracketed = host.replace(/^\[|]$/g, '')
  if (BLOCKED_HOSTNAMES.has(unbracketed.toLowerCase())) return true
  const ipVersion = net.isIP(unbracketed)
  if (ipVersion === 4) return isPrivateIPv4(unbracketed)
  if (ipVersion === 6) return isPrivateIPv6(unbracketed)
  return false
}

async function assertNoDnsRebind(hostname) {
  if (net.isIP(hostname.replace(/^\[|]$/g, '')) !== 0) return
  let addrs
  try { addrs = await dns.lookup(hostname, { all: true }) }
  catch { return } // resolution failure is surfaced by the request itself; not a security signal
  for (const { address } of addrs) {
    if (isPrivateHost(address)) {
      throw new Error(`Blocked private/internal resolved address: ${address}`)
    }
  }
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
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`Blocked private/internal host: ${parsed.hostname}`)
  }
  return parsed
}

async function assertSafeHttpsUrl(urlStr) {
  const parsed = assertHttpsUrl(urlStr)
  await assertNoDnsRebind(parsed.hostname)
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

function assertSameOriginRedirect(currentUrl, nextUrl) {
  if (currentUrl.origin !== nextUrl.origin) {
    throw new Error('Redirects to a different origin are not allowed')
  }
}

async function downloadToFile(url, filePath, options = {}, depth = 0) {
  if (depth > MAX_REDIRECTS) throw new Error('Too many redirects')
  const parsed = await assertSafeHttpsUrl(url)
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

    const req = https.get(parsed, { timeout }, (res) => {
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
  const { maxResponseBytes: _unusedMaxResponseBytes, ...requestOptions } = options
  const parsedUrl = await assertSafeHttpsUrl(url)
  return new Promise((resolve, reject) => {
    const req = https.request(parsedUrl, { ...requestOptions, timeout }, (res) => {
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
        assertSafeHttpsUrl(nextUrl).then((safeNextUrl) => {
          res.resume()
          httpRequest(safeNextUrl, options, body, depth + 1).then(resolve, reject)
        }, (err) => {
          res.resume()
          reject(err)
        })
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
        let msg = `HTTP ${res.status}`
        try {
          const json = JSON.parse(res.data)
          msg = json.error?.message || json.message || msg
        } catch {}
        throw new Error(msg)
      }
      return res
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, retryDelay))
    }
  }
  throw lastErr
}

module.exports = { httpRequest, request, assertHttpsUrl, assertApiBaseUrl, joinApiUrl, downloadToFile }
