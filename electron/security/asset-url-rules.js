const MAX_REMOTE_URL_LENGTH = 4096
const MAX_DATA_URL_LENGTH = 100 * 1024 * 1024

const ASSET_TYPE_MIMES = {
  image: new Set(['image/png', 'image/jpeg', 'image/webp']),
  video: new Set(['video/mp4'])
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  '169.254.169.254',
  '169.254.170.2'
])

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::' || lower === '::ffff:0:0') return true
  if (lower.startsWith('::ffff:')) return true
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true
  if (lower.startsWith('fe90') || lower.startsWith('fea0') || lower.startsWith('feb0')) return true
  const mapped = lower.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/)
  return Boolean(mapped && isPrivateIPv4(mapped[1]))
}

function isBlockedHost(hostname) {
  const host = String(hostname || '').replace(/^\[|]$/g, '').toLowerCase()
  if (!host || BLOCKED_HOSTNAMES.has(host)) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIPv4(host)
  if (host.includes(':')) return isPrivateIPv6(host)
  return false
}

function sanitizeDataUrl(value, type) {
  if (value.length > MAX_DATA_URL_LENGTH) return ''
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(value)
  if (!match) return ''
  const mime = match[1].toLowerCase()
  return ASSET_TYPE_MIMES[type]?.has(mime) ? value : ''
}

function sanitizeHttpsUrl(value) {
  if (value.length > MAX_REMOTE_URL_LENGTH) return ''
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'https:') return ''
  if (parsed.username || parsed.password) return ''
  if (isBlockedHost(parsed.hostname)) return ''
  return parsed.href
}

function sanitizeMediaCacheUrl(value, type) {
  let parsed
  try { parsed = new URL(value) } catch { return '' }
  if (parsed.protocol !== 'gravuresse-media:' || parsed.hostname !== 'cache') return ''
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return ''
  let fileName
  try { fileName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) } catch { return '' }
  const match = /^([a-f0-9]{64})\.(png|jpg|webp|mp4)$/.exec(fileName)
  if (!match) return ''
  const isVideo = match[2] === 'mp4'
  if ((type === 'video') !== isVideo) return ''
  return `gravuresse-media://cache/${fileName}`
}

function sanitizeAssetUrl(url, type = 'image') {
  if (typeof url !== 'string') return ''
  const cleanType = type === 'video' ? 'video' : 'image'
  const value = url.trim()
  if (!value) return ''
  if (/^gravuresse-media:/i.test(value)) return sanitizeMediaCacheUrl(value, cleanType)
  if (/^data:/i.test(value)) return sanitizeDataUrl(value, cleanType)
  return sanitizeHttpsUrl(value)
}

module.exports = {
  ASSET_TYPE_MIMES,
  MAX_DATA_URL_LENGTH,
  MAX_REMOTE_URL_LENGTH,
  isBlockedHost,
  isPrivateIPv4,
  isPrivateIPv6,
  sanitizeMediaCacheUrl,
  sanitizeAssetUrl
}
