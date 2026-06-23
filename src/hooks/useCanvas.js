import { useState, useCallback, useMemo } from 'react'
import { createAsset } from '../utils/assetFactory'

export default function useCanvas() {
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [filter, setFilter] = useState('all')

  const addAsset = useCallback((asset) => {
    const item = createAsset(asset)
    setAssets(prev => [item, ...prev])
    return item
  }, [])

  const addPlaceholder = useCallback((label) => {
    const item = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image', label: label || '生成中...', prompt: '', url: '',
      model: '', ratio: '1:1', style: '',
      createdAt: new Date().toISOString(), _generating: true
    }
    setAssets(prev => [item, ...prev])
    return item.id
  }, [])

  const removeAsset = useCallback((id) => {
    setAssets(prev => prev.filter(a => a.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
  }, [])

  const replaceAssets = useCallback((nextAssets) => {
    setAssets(Array.isArray(nextAssets) ? nextAssets : [])
  }, [])

  const updateAsset = useCallback((id, patch) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }, [])

  const updateAssets = useCallback((patches) => {
    setAssets(prev => prev.map(a => patches[a.id] ? { ...a, ...patches[a.id] } : a))
  }, [])

  const getAssetById = useCallback((id) => assets.find(a => a.id === id), [assets])

  const clear = useCallback(() => {
    setAssets([])
    setSelectedId(null)
  }, [])

  const selectedAsset = assets.find(a => a.id === selectedId) || null

  // filtered derives from assets+filter only; memoize so consumers (canvas object
  // identity) stay stable unless assets/filter actually change. Previously this
  // recomputed on every render and pulled both `filtered` and `assets` into the
  // outer useMemo deps — redundant, since `filtered` already follows `assets`.
  const filtered = useMemo(
    () => assets
      .filter(a => filter === 'all' || a.type === filter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [assets, filter]
  )

  return useMemo(() => ({
    assets: filtered, allAssets: assets, selectedAsset, selectedId, setSelectedId,
    viewMode, setViewMode, filter, setFilter,
    addAsset, addPlaceholder, removeAsset, replaceAssets, updateAsset, updateAssets, getAssetById, clear
  }), [filtered, assets, selectedAsset, selectedId, viewMode, filter, addAsset, addPlaceholder, removeAsset, replaceAssets, updateAsset, updateAssets, getAssetById, clear])
}
