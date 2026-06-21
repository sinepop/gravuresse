/**
 * Handler registry for Gravuresse Provider Pipeline.
 *
 * Maps protocol identifiers (e.g. 'anthropic', 'openai', 'ark_image') to handler functions.
 * Each handler is an async function that receives normalized params:
 *   { action, model, baseUrl, provider, auth, ...payload }
 *
 * Handlers are registered lazily via registerHandler() as they are implemented.
 * See SPEC-001 Step 2-4 for handler implementations.
 */

/** @type {Object<string, Function>} */
const HANDLER_MAP = {
  // Chat protocols
  'anthropic': null,       // TODO: handlers/anthropic.js
  'openai': null,          // TODO: handlers/openai.js
  'gemini': null,          // TODO: handlers/gemini.js
  // Image protocols
  'openai_image': null,    // TODO: handlers/openai.js (reuse)
  'gemini_image': null,    // TODO: handlers/gemini.js (reuse)
  'ark_image': null,       // TODO: handlers/volcengine.js
  // Video protocols
  'ark_video_task': null,  // TODO: handlers/volcengine.js (reuse)
  'runway_task': null,     // TODO: handlers/runway.js
  'happyhorse_task': null  // TODO: handlers/happyhorse.js
}

/**
 * Resolve a handler by protocol.
 * @param {string} protocol
 * @returns {Function|null}
 */
function resolveHandler(protocol) {
  return HANDLER_MAP[protocol] || null
}

/**
 * Register a handler function for one or more protocols.
 * @param {string|string[]} protocol
 * @param {Function} handlerFn - async (params) => result
 */
function registerHandler(protocol, handlerFn) {
  const protocols = Array.isArray(protocol) ? protocol : [protocol]
  for (const p of protocols) {
    HANDLER_MAP[p] = handlerFn
  }
}

module.exports = { resolveHandler, registerHandler }
