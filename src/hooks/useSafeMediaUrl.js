import { useEffect, useState } from 'react'
import { sanitizeAssetUrl } from '../utils/mediaSecurity.js'
import { sanitizeMediaCacheUrl } from '../utils/assetUrlRules.js'

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
