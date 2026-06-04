import { useState, useCallback } from 'react'

export default function useCanvas() {
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')

  const addAsset = useCallback((asset) => {
    const item = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image', label: asset.label || '未命名', prompt: asset.prompt || '',
      negativePrompt: asset.negativePrompt || '', url: asset.url || '',
      model: asset.model || '', ratio: asset.ratio || '1:1', style: asset.style || '',
      createdAt: new Date().toISOString(), _generating: false, ...asset
    }
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

  const updateAsset = useCallback((id, patch) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }, [])

  const getAssetById = useCallback((id) => assets.find(a => a.id === id), [assets])

  const clear = useCallback(() => {
    setAssets([])
    setSelectedId(null)
  }, [])

  const selectedAsset = assets.find(a => a.id === selectedId) || null
  const filtered = assets
    .filter(a => filter === 'all' || a.type === filter)
    .sort((a, b) => sort === 'newest' ? new Date(b.createdAt) - new Date(a.createdAt) : a.label.localeCompare(b.label))

  return {
    assets: filtered, allAssets: assets, selectedAsset, selectedId, setSelectedId,
    viewMode, setViewMode, filter, setFilter, sort, setSort,
    addAsset, addPlaceholder, removeAsset, updateAsset, getAssetById, clear
  }
}
