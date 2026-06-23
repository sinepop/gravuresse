// Shared asset-shape factory. Ensures useCanvas.addAsset and App's conversation
// bridge (createStoredAsset) construct assets with the same fields, so assets
// round-trip faithfully between the canvas and stored conversations.

let _counter = 0
function makeAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${(++_counter) % 1000}`
}

export function createAsset(asset = {}) {
  return {
    id: makeAssetId(),
    type: 'image',
    label: asset.label || '未命名',
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    url: asset.url || '',
    model: asset.model || '',
    ratio: asset.ratio || '1:1',
    style: asset.style || '',
    createdAt: new Date().toISOString(),
    _generating: false,
    ...asset
  }
}