import { sanitizeAssetUrl as sanitizeSharedAssetUrl } from './assetUrlRules.js'

export function sanitizeAssetUrl(url, type = 'image') {
  return sanitizeSharedAssetUrl(url, type)
}
