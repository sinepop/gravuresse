// @ts-check

import { useEffect, useState } from 'react'
import { sanitizeAssetUrl } from '../utils/mediaSecurity.js'

/** @typedef {import('../types/domain').AssetType} AssetType */
/** @typedef {'empty' | 'blocked' | 'direct' | 'remote'} PreviewUrlKind */

const CACHE_FILE_RE = /^[a-f0-9]{64}\.(png|jpg|webp|mp4)$/

/** @param {unknown} url @param {unknown} type @returns {string} */
function sanitizeMediaCacheUrl(url = '', type = 'image') {
  if (typeof url !== 'string') return ''
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'gravuresse-media:' || parsed.hostname !== 'cache') return ''
  const fileName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!CACHE_FILE_RE.test(fileName)) return ''
  const isVideo = fileName.endsWith('.mp4')
  if (type === 'video') return isVideo ? parsed.href : ''
  return isVideo ? '' : parsed.href
}

/** @param {unknown} url @param {unknown} type @returns {{ kind: PreviewUrlKind, url: string }} */
export function normalizePreviewUrl(url = '', type = 'image') {
  const mediaType = type === 'video' ? 'video' : 'image'
  const value = typeof url === 'string' ? url.trim() : ''
  if (!value) return { kind: 'empty', url: '' }

  const cached = sanitizeMediaCacheUrl(value, mediaType)
  if (cached) return { kind: 'direct', url: cached }

  const safeUrl = sanitizeAssetUrl(value, mediaType)
  if (!safeUrl) return { kind: 'blocked', url: '' }
  if (/^data:/i.test(safeUrl)) return { kind: 'direct', url: safeUrl }
  return { kind: 'remote', url: safeUrl }
}

/** @param {unknown} url @param {unknown} type */
export default function useSafeMediaUrl(url, type = 'image') {
  const [state, setState] = useState({ src: '', loading: false })

  useEffect(() => {
    let cancelled = false
    const mediaType = type === 'video' ? 'video' : 'image'
    const preview = normalizePreviewUrl(url, mediaType)

    if (!preview.url) {
      setState({ src: '', loading: false })
      return () => { cancelled = true }
    }

    if (preview.kind === 'direct') {
      setState({ src: preview.url, loading: false })
      return () => { cancelled = true }
    }

    if (preview.kind !== 'remote' || !window.electronAPI?.cacheAssetPreview) {
      setState({ src: '', loading: false })
      return () => { cancelled = true }
    }

    setState({ src: '', loading: true })
    window.electronAPI.cacheAssetPreview({ url: preview.url, type: mediaType })
      .then(src => {
        if (!cancelled) setState({ src: typeof src === 'string' ? src : '', loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ src: '', loading: false })
      })

    return () => { cancelled = true }
  }, [url, type])

  return state
}
