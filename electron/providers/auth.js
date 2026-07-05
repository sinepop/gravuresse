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

const RESTRICTED_CUSTOM_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate'
])

function cleanCustomHeaderName(name) {
  const value = String(name || '').trim()
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(value)) {
    throw new Error('Invalid custom auth header name')
  }
  if (RESTRICTED_CUSTOM_HEADERS.has(value.toLowerCase())) {
    throw new Error('Restricted custom auth header name')
  }
  return value
}

/**
 * Resolve authentication headers and query params for a provider.
 * @param {Object} providerDef - Provider definition from registry
 * @param {Object} credentials - { apiKey?, sessionToken? }
 * @param {Object} override - { authType?, customAuth? }
 * @returns {{ headers: Object, queryParams: Object }}
 */
function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function resolveAuth(providerDef, credentials, override = {}) {
  const customType = normalizeAuthType(override.customAuth?.type)
  const overrideType = normalizeAuthType(override.authType?.type)
  const registryType = normalizeAuthType(providerDef.authType?.type)
  const authType = customType
    ? { ...override.customAuth, type: customType }
    : overrideType
      ? { ...override.authType, type: overrideType }
      : registryType
        ? { ...providerDef.authType, type: registryType }
        : { type: 'bearer' }
  const headers = {}
  const queryParams = {}

  switch (authType.type) {
    case 'none':
      break

    case 'bearer':
      headers['Authorization'] = `Bearer ${credentials.apiKey || ''}`
      break

    case 'api-key':
    case 'apikey':
    case 'header':
      headers[cleanCustomHeaderName(authType.headerName || authType.key || 'Authorization')] = credentials.apiKey || ''
      break

    case 'query':
      queryParams[authType.paramName || authType.key || 'api_key'] = credentials.apiKey || ''
      break

    case 'cookie':
      throw new Error('Cookie authentication is not supported. Use a session token header instead.')

    case 'session':
      headers[cleanCustomHeaderName(authType.sessionHeaderName || authType.headerName || authType.key || 'X-Session-Token')] = credentials.sessionToken || ''
      break

    default:
      headers['Authorization'] = `Bearer ${credentials.apiKey || ''}`
  }

  return { headers, queryParams }
}

module.exports = { resolveAuth }
