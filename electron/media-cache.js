const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MEDIA_CACHE_SCHEME = 'gravuresse-media'
const MEDIA_CACHE_HOST = 'cache'
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024
const DEFAULT_MAX_CACHE_ENTRY_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 4
const downloadQueues = new Map()
const previewDownloads = new Map()
const activeDownloadPaths = new Set()
const maintainedCacheLimits = new Map()
const ASSET_MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4'
}
const MEDIA_CACHE_FILE_RE = /^[a-f0-9]{64}\.(png|jpg|webp|mp4)$/
const MEDIA_CACHE_PARTIAL_RE = /^[a-f0-9]{64}\.(?:tmp|download)-[a-z0-9.-]+$/i

function boundedPositiveInteger(value, fallback, ceiling = fallback) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) return fallback
  return Math.min(number, ceiling)
}

function touchCacheFile(filePath) {
  const now = new Date()
  try { fs.utimesSync(filePath, now, now) } catch {}
}

function isActiveDownloadArtifact(filePath) {
  const resolved = path.resolve(filePath)
  for (const activePath of activeDownloadPaths) {
    if (resolved === activePath || resolved.startsWith(`${activePath}.tmp-`)) return true
  }
  return false
}

function cleanupOrphanedCachePartials(cacheDir) {
  for (const fileName of fs.readdirSync(cacheDir)) {
    if (!MEDIA_CACHE_PARTIAL_RE.test(fileName)) continue
    const filePath = path.resolve(cacheDir, fileName)
    if (isActiveDownloadArtifact(filePath)) continue
    try { fs.unlinkSync(filePath) } catch {}
  }
}

function removeDownloadArtifacts(downloadPath) {
  const resolvedDownloadPath = path.resolve(downloadPath)
  const cacheDir = path.dirname(resolvedDownloadPath)
  const baseName = path.basename(resolvedDownloadPath)
  let fileNames = []
  try { fileNames = fs.readdirSync(cacheDir) } catch {}
  for (const fileName of fileNames) {
    if (fileName !== baseName && !fileName.startsWith(`${baseName}.tmp-`)) continue
    try { fs.unlinkSync(path.join(cacheDir, fileName)) } catch {}
  }
}

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
    if (fs.existsSync(filePath)) {
      touchCacheFile(filePath)
      return { fileName, filePath }
    }
  }
  return null
}

function listCacheEntries(cacheDir) {
  const entries = []
  for (const fileName of fs.readdirSync(cacheDir)) {
    if (!MEDIA_CACHE_FILE_RE.test(fileName)) continue
    const filePath = path.join(cacheDir, fileName)
    try {
      const stat = fs.lstatSync(filePath)
      if (!stat.isFile() || stat.isSymbolicLink()) continue
      entries.push({ fileName, filePath, size: stat.size, mtimeMs: stat.mtimeMs })
    } catch {}
  }
  return entries
}

function pruneCacheForBytes(cacheDir, incomingBytes, maxCacheBytes, preserveFilePath = '') {
  if (incomingBytes > maxCacheBytes) throw new Error('Asset cache entry is too large')
  const entries = listCacheEntries(cacheDir)
  const preserved = preserveFilePath ? path.resolve(preserveFilePath) : null
  let totalBytes = entries.reduce((total, entry) => total + entry.size, 0)
  entries.sort((a, b) => {
    const preservationOrder = Number(path.resolve(a.filePath) === preserved) -
      Number(path.resolve(b.filePath) === preserved)
    return preservationOrder || a.mtimeMs - b.mtimeMs || a.fileName.localeCompare(b.fileName)
  })
  for (const entry of entries) {
    if (totalBytes + incomingBytes <= maxCacheBytes) break
    try {
      fs.unlinkSync(entry.filePath)
      totalBytes -= entry.size
    } catch {}
  }
  if (totalBytes + incomingBytes > maxCacheBytes) throw new Error('Asset cache quota is exhausted')
}

function maintainCacheCapacity(cacheDir, maxCacheBytes, preserveFilePath = '') {
  const key = path.resolve(cacheDir)
  const previousLimit = maintainedCacheLimits.get(key)
  if (previousLimit !== undefined && previousLimit <= maxCacheBytes) return
  cleanupOrphanedCachePartials(cacheDir)
  pruneCacheForBytes(cacheDir, 0, maxCacheBytes, preserveFilePath)
  maintainedCacheLimits.set(key, maxCacheBytes)
}

function runWithDownloadSlot(cacheDir, limit, task) {
  const key = path.resolve(cacheDir)
  let state = downloadQueues.get(key)
  if (!state) {
    state = { active: 0, limit, pending: [] }
    downloadQueues.set(key, state)
  } else {
    state.limit = Math.min(state.limit, limit)
  }

  return new Promise((resolve, reject) => {
    state.pending.push({ task, resolve, reject })
    const drain = () => {
      while (state.active < state.limit && state.pending.length) {
        const item = state.pending.shift()
        state.active++
        Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => {
          state.active--
          drain()
          if (state.active === 0 && state.pending.length === 0) downloadQueues.delete(key)
        })
      }
    }
    drain()
  })
}

function mediaCacheDataUrl(url, { cacheDir, validateAssetBytes, type, maxBytes } = {}) {
  const byteLimit = boundedPositiveInteger(maxBytes, DEFAULT_MAX_CACHE_ENTRY_BYTES, DEFAULT_MAX_CACHE_ENTRY_BYTES)
  const filePath = parseMediaCacheUrl(url, cacheDir)
  const pathStat = fs.lstatSync(filePath)
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new Error('Invalid media cache file')
  const descriptor = fs.openSync(filePath, 'r')
  let bytes
  try {
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile()) throw new Error('Invalid media cache file')
    if (stat.size > byteLimit) throw new Error('Asset cache entry is too large')
    const buffer = Buffer.allocUnsafe(Math.min(stat.size + 1, byteLimit + 1))
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (count === 0) break
      bytesRead += count
    }
    if (bytesRead !== stat.size || bytesRead > byteLimit) {
      throw new Error('Asset cache file changed while reading')
    }
    bytes = buffer.subarray(0, bytesRead)
  } finally {
    fs.closeSync(descriptor)
  }
  const declaredMime = mediaCacheMime(path.basename(filePath))
  const mime = validateAssetBytes(bytes, type, declaredMime)
  if (mime !== declaredMime || !ASSET_MIME_EXTENSIONS[mime]) {
    throw new Error('Asset MIME does not match cache file')
  }
  touchCacheFile(filePath)
  return `data:${mime};base64,${bytes.toString('base64')}`
}

function cacheAssetBytes(bytes, type, declaredMime, { cacheDir, validateAssetBytes, maxCacheBytes } = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || [])
  const mime = validateAssetBytes(buffer, type, declaredMime)
  const ext = ASSET_MIME_EXTENSIONS[mime]
  if (!ext) throw new Error('Unsupported asset cache type')
  const cacheByteLimit = boundedPositiveInteger(maxCacheBytes, DEFAULT_MAX_CACHE_BYTES, DEFAULT_MAX_CACHE_BYTES)
  if (buffer.length > DEFAULT_MAX_CACHE_ENTRY_BYTES || buffer.length > cacheByteLimit) {
    throw new Error('Asset cache entry is too large')
  }
  fs.mkdirSync(cacheDir, { recursive: true })
  maintainCacheCapacity(cacheDir, cacheByteLimit)
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  const fileName = `${hash}${ext}`
  const filePath = path.join(cacheDir, fileName)
  if (fs.existsSync(filePath)) {
    touchCacheFile(filePath)
  } else {
    pruneCacheForBytes(cacheDir, buffer.length, cacheByteLimit)
    const temporary = path.join(cacheDir, `${hash}.tmp-${crypto.randomUUID()}`)
    try {
      fs.writeFileSync(temporary, buffer, { flag: 'wx' })
      if (!fs.existsSync(filePath)) fs.renameSync(temporary, filePath)
      else fs.unlinkSync(temporary)
    } catch (error) {
      try { fs.unlinkSync(temporary) } catch {}
      throw error
    }
  }
  return {
    url: mediaCacheUrlForFileName(fileName),
    mime,
    size: buffer.length
  }
}

async function cacheAssetPreview(params, {
  cacheDir,
  downloadToFile,
  validateAssetBytes,
  maxCacheBytes,
  maxConcurrentDownloads,
  maxDownloadBytes
} = {}) {
  const { url, type } = normalizePreviewParams(params)
  if (url.startsWith('data:') || url.startsWith(`${MEDIA_CACHE_SCHEME}:`)) return url
  if (!url.startsWith('https://')) throw new Error('Only HTTPS asset previews are cached')

  fs.mkdirSync(cacheDir, { recursive: true })
  const cacheByteLimit = boundedPositiveInteger(maxCacheBytes, DEFAULT_MAX_CACHE_BYTES, DEFAULT_MAX_CACHE_BYTES)
  const downloadByteLimit = boundedPositiveInteger(
    maxDownloadBytes,
    Math.min(DEFAULT_MAX_CACHE_ENTRY_BYTES, cacheByteLimit),
    Math.min(DEFAULT_MAX_CACHE_ENTRY_BYTES, cacheByteLimit)
  )
  const concurrencyLimit = boundedPositiveInteger(
    maxConcurrentDownloads,
    DEFAULT_MAX_CONCURRENT_DOWNLOADS,
    DEFAULT_MAX_CONCURRENT_DOWNLOADS
  )
  const hash = crypto.createHash('sha256').update(`${type}\0${url}`).digest('hex')
  const existing = cachedFileFor(cacheDir, hash)
  maintainCacheCapacity(cacheDir, cacheByteLimit, existing?.filePath)
  if (existing && fs.existsSync(existing.filePath)) return mediaCacheUrlForFileName(existing.fileName)

  const pendingKey = `${path.resolve(cacheDir)}\0${hash}`
  const pending = previewDownloads.get(pendingKey)
  if (pending) return pending

  const operation = runWithDownloadSlot(cacheDir, concurrencyLimit, async () => {
    const queuedExisting = cachedFileFor(cacheDir, hash)
    if (queuedExisting) return mediaCacheUrlForFileName(queuedExisting.fileName)

    const downloadPath = path.join(cacheDir, `${hash}.download-${crypto.randomUUID()}`)
    activeDownloadPaths.add(path.resolve(downloadPath))
    try {
      await downloadToFile(url, downloadPath, { maxBytes: downloadByteLimit })
      const stat = fs.lstatSync(downloadPath)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid asset preview download')
      if (stat.size > downloadByteLimit || stat.size > cacheByteLimit) {
        throw new Error('Asset preview download is too large')
      }
      const bytes = fs.readFileSync(downloadPath)
      if (bytes.length > downloadByteLimit || bytes.length > cacheByteLimit) {
        throw new Error('Asset preview download is too large')
      }
      const mime = validateAssetBytes(bytes, type)
      const ext = ASSET_MIME_EXTENSIONS[mime]
      if (!ext) throw new Error('Unsupported asset preview type')
      const fileName = `${hash}${ext}`
      const filePath = path.join(cacheDir, fileName)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(downloadPath)
        touchCacheFile(filePath)
      } else {
        pruneCacheForBytes(cacheDir, bytes.length, cacheByteLimit)
        fs.renameSync(downloadPath, filePath)
      }
      return mediaCacheUrlForFileName(fileName)
    } finally {
      activeDownloadPaths.delete(path.resolve(downloadPath))
      removeDownloadArtifacts(downloadPath)
    }
  })
  previewDownloads.set(pendingKey, operation)
  try {
    return await operation
  } finally {
    if (previewDownloads.get(pendingKey) === operation) previewDownloads.delete(pendingKey)
  }
}

module.exports = {
  MEDIA_CACHE_SCHEME,
  MEDIA_CACHE_HOST,
  cacheAssetBytes,
  cacheAssetPreview,
  mediaCacheDataUrl,
  mediaCacheMime,
  mediaCacheUrlForFileName,
  parseMediaCacheUrl,
  _test: {
    DEFAULT_MAX_CACHE_BYTES,
    DEFAULT_MAX_CACHE_ENTRY_BYTES,
    DEFAULT_MAX_CONCURRENT_DOWNLOADS,
    cleanupOrphanedCachePartials,
    listCacheEntries,
    maintainCacheCapacity,
    normalizePreviewParams,
    pruneCacheForBytes
  }
}
