// Single source of truth for legacy provider-id → canonical registry-id aliasing.
// Used by useChat, useConfig, Settings, and (mirrored) by the main process so
// legacy direct-API IPC channels resolve a providerId the pipeline understands.
// Keep this in sync with PROVIDER_ID_ALIASES in electron/main.js.

export const PROVIDER_ID_ALIASES = {
  chat: { claude: 'anthropic', gemini: 'google', qwen: 'alibaba', kimi: 'moonshot', doubao: 'volcengine' },
  image: { dalle: 'openai', gemini_img: 'google', jimeng_img: 'volcengine' },
  video: { jimeng_vid: 'volcengine' }
}

/** Resolve a (possibly legacy) provider id to its canonical registry id. */
export function resolveProviderId(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id
}

export function sameProviderId(track, a, b) {
  return Boolean(a && b && resolveProviderId(track, a) === resolveProviderId(track, b))
}
