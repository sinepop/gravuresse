/**
 * Auth resolver for Gravuresse Provider Pipeline.
 *
 * Supports active auth types:
 *   - bearer:  Authorization: Bearer <key>
 *   - header:  <key>: <value>
 *   - query:   ?<key>=<value>
 *   - session: X-Session-Token: <token>
 *
 * Cookie authentication is intentionally unsupported.
 */

/**
 * Resolve authentication headers and query params for a provider.
 * @param {Object} providerDef - Provider definition from registry
 * @param {Object} credentials - { apiKey?, sessionToken? }
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
      throw new Error('Cookie authentication is not supported. Use a session token header instead.')

    case 'session':
      headers[authType.headerName || authType.key || 'X-Session-Token'] = credentials.sessionToken || ''
      break

    default:
      headers['Authorization'] = `Bearer ${credentials.apiKey || ''}`
  }

  return { headers, queryParams }
}

module.exports = { resolveAuth }
