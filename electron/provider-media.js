const LOCAL_MEDIA_PREFIX = 'gravuresse-media:'
const SOURCE_MEDIA_FIELDS = ['sourceImageUrl', 'source_image_url']

function inlineProviderMediaPayload(payload = {}, resolveLocalMedia) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  let result = payload
  for (const field of SOURCE_MEDIA_FIELDS) {
    const value = payload[field]
    if (typeof value !== 'string' || !value.startsWith(LOCAL_MEDIA_PREFIX)) continue
    if (typeof resolveLocalMedia !== 'function') throw new Error('Local media resolver is unavailable')
    if (result === payload) result = { ...payload }
    result[field] = resolveLocalMedia(value, 'image')
  }
  return result
}

function pollSessionPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const result = { ...payload }
  for (const field of SOURCE_MEDIA_FIELDS) delete result[field]
  return result
}

module.exports = { inlineProviderMediaPayload, pollSessionPayload }
