// @ts-check

import { sanitizeAssetUrl as sanitizeSharedAssetUrl } from './assetUrlRules.js'

/**
 * @param {unknown} url
 * @param {unknown} [type='image']
 * @returns {string}
 */
export function sanitizeAssetUrl(url, type = 'image') {
  return sanitizeSharedAssetUrl(url, type)
}
