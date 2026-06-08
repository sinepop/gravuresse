const fs = require('fs')
const https = require('https')

const DEFAULT_TIMEOUT = 60000
const DEFAULT_DOWNLOAD_TIMEOUT = 60000
const DEFAULT_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024
const MAX_REDIRECTS = 5

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

function downloadToFile(url, filePath, options = {}, depth = 0) {
  if (depth > MAX_REDIRECTS) return Promise.reject(new Error('Too many redirects'))
  const parsed = assertHttpsUrl(url)
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
        const nextUrl = new URL(res.headers.location, parsed).href
        try {
          assertHttpsUrl(nextUrl)
        } catch (e) {
          return fail(e)
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

function httpRequest(url, options = {}, body = null) {
  const timeout = options.timeout || DEFAULT_TIMEOUT
  const maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES
  const { maxResponseBytes: _unusedMaxResponseBytes, ...requestOptions } = options
  return new Promise((resolve, reject) => {
    const parsedUrl = assertHttpsUrl(url)
    const req = https.request(parsedUrl, { ...requestOptions, timeout }, (res) => {
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
