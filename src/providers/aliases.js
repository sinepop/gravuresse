// @ts-check

// Single source of truth for legacy provider-id → canonical registry-id aliasing.
// Used by useChat, useConfig, Settings, and (mirrored) by the main process so
// legacy direct-API IPC channels resolve a providerId the pipeline understands.
// Keep this in sync with PROVIDER_ID_ALIASES in electron/main.js.

/** @typedef {import('../types/domain').Track} Track */

/** @type {Record<Track, Record<string, string>>} */
export const PROVIDER_ID_ALIASES = {
  chat: { claude: 'anthropic', gemini: 'google', qwen: 'alibaba', kimi: 'moonshot', doubao: 'volcengine' },
  image: { dalle: 'openai', gemini_img: 'google', jimeng_img: 'volcengine' },
  video: { jimeng_vid: 'volcengine' }
}

/** Resolve a (possibly legacy) provider id to its canonical registry id. */
/**
 * @param {unknown} track
 * @param {unknown} id
 * @returns {string}
 */
export function resolveProviderId(track, id) {
  const value = typeof id === 'string' ? id : ''
  if (track !== 'chat' && track !== 'image' && track !== 'video') return value
  return PROVIDER_ID_ALIASES[track][value] || value
}

/**
 * @param {unknown} track
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameProviderId(track, a, b) {
  return typeof a === 'string' && Boolean(a) && typeof b === 'string' && Boolean(b) &&
    resolveProviderId(track, a) === resolveProviderId(track, b)
}
