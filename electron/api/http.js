const https = require('https')
const http = require('http')

const DEFAULT_TIMEOUT = 60000

/**
 * 统一 HTTP 请求工具
 * @param {URL|string} url
 * @param {object} options - method, headers, timeout
 * @param {object|string|null} body - request body
 * @returns {Promise<{status: number, data: string, headers: object}>}
 */
function httpRequest(url, options = {}, body = null) {
  const timeout = options.timeout || DEFAULT_TIMEOUT
  return new Promise((resolve, reject) => {
    const parsedUrl = typeof url === 'string' ? new URL(url) : url
    const mod = parsedUrl.protocol === 'https:' ? https : http
    const req = mod.request(parsedUrl, { ...options, timeout }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
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

/**
 * 带状态码检查和重试的 HTTP 请求
 */
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

module.exports = { httpRequest, request }
