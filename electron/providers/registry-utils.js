function normalizeProviderMeta(provider = {}) {
  return {
    ...(provider.meta || {}),
    links: provider.links || {},
    billing: provider.billing || { mode: 'unknown', note: '' },
    capabilities: provider.capabilities || {},
    constraints: provider.constraints || {},
    customizable: provider.customizable || {}
  }
}

function attachProviderMeta(provider = {}) {
  provider.meta = normalizeProviderMeta(provider)
  return provider
}

function uniqueModelIds(items = []) {
  return Array.from(new Set(items.map(item => String(item || '').trim()).filter(Boolean)))
}

module.exports = {
  attachProviderMeta,
  normalizeProviderMeta,
  uniqueModelIds
}
