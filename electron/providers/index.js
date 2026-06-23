/**
 * Provider handler loader.
 *
 * Each handler module in ./handlers/*.js registers itself at import time via
 * registerHandler() (see handler.js). Without requiring them here, the
 * HANDLER_MAP stays all-null and the pipeline returns NO_HANDLER for every
 * call — so this require is the single wiring point that makes the provider
 * pipeline functional. Keep it as a flat explicit list (no dynamic glob) so the
 * bundler copies each handler and the dependency graph is obvious.
 */
require('./handlers/anthropic')
require('./handlers/openai')
require('./handlers/gemini')
require('./handlers/ark')
require('./handlers/runway')
require('./handlers/happyhorse')
require('./handlers/custom')

module.exports = { loaded: true }
