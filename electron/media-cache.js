const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MEDIA_CACHE_SCHEME = 'gravuresse-media'
const MEDIA_CACHE_HOST = 'cache'
const ASSET_MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4'
}
const MEDIA_CACHE_FILE_RE = /^[a-f0-9]{64}\.(png|jpg|webp|mp4)$/

function normalizePreviewParams(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Asset preview request must be an object')
  }
  const url = typeof params.url === 'string' ? params.url.trim() : ''
  const type = params.type === 'video' ? 'video' : params.type === 'image' ? 'image' : ''
  if (!url) throw new Error('Asset preview URL is required')
  if (!type) throw new Error('Asset preview type must be image or video')
  return { url, type }
}

function mediaCacheUrlForFileName(fileName) {
  if (!MEDIA_CACHE_FILE_RE.test(fileName)) throw new Error('Invalid media cache file name')
  return `${MEDIA_CACHE_SCHEME}://${MEDIA_CACHE_HOST}/${fileName}`
}

function mediaCacheMime(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.mp4') return 'video/mp4'
  return 'application/octet-stream'
}

function parseMediaCacheUrl(url, cacheDir) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid media cache URL')
  }
  if (parsed.protocol !== `${MEDIA_CACHE_SCHEME}:` || parsed.hostname !== MEDIA_CACHE_HOST) {
    throw new Error('Invalid media cache URL')
  }
  const fileName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!MEDIA_CACHE_FILE_RE.test(fileName)) throw new Error('Invalid media cache file name')
  const target = path.resolve(cacheDir, fileName)
  const root = path.resolve(cacheDir)
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid media cache path')
  return target
}

function cachedFileFor(cacheDir, hash) {
  for (const ext of Object.values(ASSET_MIME_EXTENSIONS)) {
    const fileName = `${hash}${ext}`
    const filePath = path.join(cacheDir, fileName)
    if (fs.existsSync(filePath)) return { fileName, filePath }
  }
  return null
}

async function cacheAssetPreview(params, { cacheDir, downloadToFile, validateAssetBytes }) {
  const { url, type } = normalizePreviewParams(params)
  if (url.startsWith('data:') || url.startsWith(`${MEDIA_CACHE_SCHEME}:`)) return url
  if (!url.startsWith('https://')) throw new Error('Only HTTPS asset previews are cached')

  fs.mkdirSync(cacheDir, { recursive: true })
  const hash = crypto.createHash('sha256').update(`${type}\0${url}`).digest('hex')
  const existing = cachedFileFor(cacheDir, hash)
  if (existing) return mediaCacheUrlForFileName(existing.fileName)

  const downloadPath = path.join(cacheDir, `${hash}.download-${crypto.randomUUID()}`)
  try {
    await downloadToFile(url, downloadPath)
    const bytes = fs.readFileSync(downloadPath)
    const mime = validateAssetBytes(bytes, type)
    const ext = ASSET_MIME_EXTENSIONS[mime]
    if (!ext) throw new Error('Unsupported asset preview type')
    const fileName = `${hash}${ext}`
    const filePath = path.join(cacheDir, fileName)
    if (!fs.existsSync(filePath)) fs.renameSync(downloadPath, filePath)
    else fs.unlinkSync(downloadPath)
    return mediaCacheUrlForFileName(fileName)
  } catch (e) {
    try { fs.unlinkSync(downloadPath) } catch {}
    throw e
  }
}

module.exports = {
  MEDIA_CACHE_SCHEME,
  MEDIA_CACHE_HOST,
  cacheAssetPreview,
  mediaCacheMime,
  mediaCacheUrlForFileName,
  parseMediaCacheUrl,
  _test: { normalizePreviewParams }
}
