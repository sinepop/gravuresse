import { useState, useCallback, useMemo, useRef } from 'react'
import { createAsset, mergeAsset } from '../utils/assetFactory'

function cloneAssets(assets) {
  if (typeof structuredClone === 'function') return structuredClone(assets)
  return JSON.parse(JSON.stringify(assets))
}

function normalizeAssets(assets) {
  return Array.isArray(assets) ? assets.map(asset => createAsset(asset)) : []
}

export default function useCanvas() {
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const undoStack = useRef([])
  const redoStack = useRef([])

  const commitAssets = useCallback((updater, options = {}) => {
    setAssets(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (next === prev) return prev
      if (options.history === true) {
        undoStack.current.push(cloneAssets(prev))
        if (undoStack.current.length > 80) undoStack.current.shift()
        redoStack.current = []
      }
      return next
    })
  }, [])

  const addAsset = useCallback((asset, options = {}) => {
    const item = createAsset(asset)
    commitAssets(prev => [item, ...prev], options)
    return item
  }, [commitAssets])

  const addPlaceholder = useCallback((label, asset = {}, options = {}) => {
    const item = createAsset({
      type: 'image',
      label: label || 'Generating...',
      prompt: '',
      url: '',
      model: '',
      ratio: '1:1',
      style: '',
      ...asset,
      _generating: true
    })
    commitAssets(prev => [item, ...prev], options)
    return item.id
  }, [commitAssets])

  const removeAsset = useCallback((id, options = {}) => {
    commitAssets(prev => prev.filter(a => a.id !== id), options)
    setSelectedId(prev => prev === id ? null : prev)
  }, [commitAssets])

  const replaceAssets = useCallback((nextAssets) => {
    const normalized = normalizeAssets(nextAssets)
    undoStack.current = []
    redoStack.current = []
    setAssets(normalized)
    return normalized
  }, [])

  const updateAsset = useCallback((id, patch, options = {}) => {
    commitAssets(prev => prev.map(a => a.id === id ? mergeAsset(a, patch) : a), options)
  }, [commitAssets])

  const updateAssets = useCallback((patches, options = {}) => {
    commitAssets(prev => prev.map(a => patches[a.id] ? mergeAsset(a, patches[a.id]) : a), options)
  }, [commitAssets])

  const getAssetById = useCallback((id) => assets.find(a => a.id === id), [assets])

  const clear = useCallback(() => {
    commitAssets([], { history: true })
    setSelectedId(null)
  }, [commitAssets])

  const undo = useCallback(() => {
    setAssets(prev => {
      if (undoStack.current.length === 0) return prev
      const next = undoStack.current.pop()
      redoStack.current.push(cloneAssets(prev))
      return cloneAssets(next)
    })
  }, [])

  const redo = useCallback(() => {
    setAssets(prev => {
      if (redoStack.current.length === 0) return prev
      const next = redoStack.current.pop()
      undoStack.current.push(cloneAssets(prev))
      return cloneAssets(next)
    })
  }, [])

  const selectedAsset = assets.find(a => a.id === selectedId) || null
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [assets]
  )

  return useMemo(() => ({
    assets: sortedAssets,
    allAssets: assets,
    selectedAsset,
    selectedId,
    setSelectedId,
    viewMode,
    setViewMode,
    addAsset,
    addPlaceholder,
    removeAsset,
    replaceAssets,
    updateAsset,
    updateAssets,
    getAssetById,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    clear
  }), [sortedAssets, assets, selectedAsset, selectedId, viewMode, addAsset, addPlaceholder, removeAsset, replaceAssets, updateAsset, updateAssets, getAssetById, undo, redo, clear])
}
