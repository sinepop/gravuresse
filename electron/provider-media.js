const LOCAL_MEDIA_PREFIX = 'gravuresse-media:'
const SOURCE_MEDIA_FIELDS = ['sourceImageUrl', 'source_image_url']

function inlineLocalMediaUrl(value, resolveLocalMedia, type = 'image') {
  if (typeof value !== 'string' || !value.startsWith(LOCAL_MEDIA_PREFIX)) return value
  if (typeof resolveLocalMedia !== 'function') throw new Error('Local media resolver is unavailable')
  return resolveLocalMedia(value, type)
}

function inlineContentPartMedia(part, resolveLocalMedia) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return part
  const imageUrl = part.image_url
  if (typeof imageUrl === 'string') {
    const inlined = inlineLocalMediaUrl(imageUrl, resolveLocalMedia, 'image')
    return inlined === imageUrl ? part : { ...part, image_url: inlined }
  }
  if (imageUrl && typeof imageUrl === 'object' && !Array.isArray(imageUrl) && typeof imageUrl.url === 'string') {
    const inlined = inlineLocalMediaUrl(imageUrl.url, resolveLocalMedia, 'image')
    return inlined === imageUrl.url ? part : { ...part, image_url: { ...imageUrl, url: inlined } }
  }
  return part
}

function inlineMessageContentMedia(content, resolveLocalMedia) {
  if (!Array.isArray(content)) return content
  let changed = false
  const next = content.map(part => {
    const inlined = inlineContentPartMedia(part, resolveLocalMedia)
    if (inlined !== part) changed = true
    return inlined
  })
  return changed ? next : content
}

function inlineProviderMessageMedia(messages, resolveLocalMedia) {
  if (!Array.isArray(messages)) return messages
  let changed = false
  const next = messages.map(message => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return message
    const content = inlineMessageContentMedia(message.content, resolveLocalMedia)
    if (content === message.content) return message
    changed = true
    return { ...message, content }
  })
  return changed ? next : messages
}

function inlineProviderMediaPayload(payload = {}, resolveLocalMedia) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  let result = payload
  for (const field of SOURCE_MEDIA_FIELDS) {
    const value = payload[field]
    if (typeof value !== 'string' || !value.startsWith(LOCAL_MEDIA_PREFIX)) continue
    if (result === payload) result = { ...payload }
    result[field] = inlineLocalMediaUrl(value, resolveLocalMedia, 'image')
  }
  const messages = inlineProviderMessageMedia(payload.messages, resolveLocalMedia)
  if (messages !== payload.messages) {
    if (result === payload) result = { ...payload }
    result.messages = messages
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
