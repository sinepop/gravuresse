/**
 * Auth resolver for Gravuresse Provider Pipeline.
 *
 * Supports three active auth types:
 *   - bearer:  Authorization: Bearer <key>
 *   - header:  <key>: <value>
 *   - query:   ?<key>=<value>
 *
 * Also reserves (stub-only) types for future subscription integration:
 *   - cookie:  Cookie: <session-cookie>
 *   - session: X-Session-Token: <token>
 */

/**
 * Resolve authentication headers and query params for a provider.
 * @param {Object} providerDef - Provider definition from registry
 * @param {Object} credentials - { apiKey?, cookie?, sessionToken? }
 * @returns {{ headers: Object, queryParams: Object }}
 */
function resolveAuth(providerDef, credentials) {
  const authType = providerDef.authType || { type: 'bearer' }
  const headers = {}
  const queryParams = {}

  switch (authType.type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${credentials.apiKey || ''}`
      break

    case 'header':
      headers[authType.key || 'Authorization'] = credentials.apiKey || ''
      break

    case 'query':
      queryParams[authType.key || 'api_key'] = credentials.apiKey || ''
      break

    case 'cookie':
      // TODO: Subscription integration — user provides browser Cookie from developer tools
      headers['Cookie'] = credentials.cookie || ''
      if (authType.headers) Object.assign(headers, authType.headers)
      break

    case 'session':
      // TODO: Subscription integration — user provides session token
      headers[authType.key || 'X-Session-Token'] = credentials.sessionToken || ''
      break

    default:
      headers['Authorization'] = `Bearer ${credentials.apiKey || ''}`
  }

  return { headers, queryParams }
}

module.exports = { resolveAuth }
