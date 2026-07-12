// @ts-check

import { useState, useCallback, useMemo, useRef } from 'react'
import { createAsset, mergeAsset } from '../utils/assetFactory'

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {import('../types/domain').AssetMutationOptions} AssetMutationOptions */
/** @typedef {import('../types/domain').CanvasController} CanvasController */
/** @typedef {import('../types/domain').CanvasViewMode} CanvasViewMode */
/** @typedef {Record<string, unknown>} UnknownRecord */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {Asset[]} assets @returns {Asset[]} */
function cloneAssets(assets) {
  if (typeof structuredClone === 'function') return structuredClone(assets)
  return JSON.parse(JSON.stringify(assets))
}

/** @param {unknown} assets @returns {Asset[]} */
function normalizeAssets(assets) {
  return Array.isArray(assets) ? assets.map(asset => createAsset(asset)) : []
}

/** @returns {CanvasController} */
export default function useCanvas() {
  const [assets, setAssets] = useState(/** @type {Asset[]} */ ([]))
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null))
  const [viewMode, setViewMode] = useState(/** @type {CanvasViewMode} */ ('grid'))
  const undoStack = useRef(/** @type {Asset[][]} */ ([]))
  const redoStack = useRef(/** @type {Asset[][]} */ ([]))

  const commitAssets = useCallback(/** @param {Asset[] | ((assets: Asset[]) => Asset[])} updater @param {AssetMutationOptions} [options] */ (updater, options = {}) => {
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

  const addAsset = useCallback(/** @param {unknown} asset @param {AssetMutationOptions} [options] */ (asset, options = {}) => {
    const item = createAsset(asset)
    commitAssets(prev => [item, ...prev], options)
    return item
  }, [commitAssets])

  const addAssets = useCallback(/** @param {unknown[]} nextAssets @param {AssetMutationOptions} [options] */ (nextAssets, options = {}) => {
    const items = Array.isArray(nextAssets) ? nextAssets.map(asset => createAsset(asset)) : []
    if (items.length > 0) commitAssets(prev => [...items, ...prev], options)
    return items
  }, [commitAssets])

  const addPlaceholder = useCallback(/** @param {string} label @param {unknown} [asset] @param {AssetMutationOptions} [options] */ (label, asset = {}, options = {}) => {
    const source = isRecord(asset) ? asset : {}
    const item = createAsset({
      type: 'image',
      label: label || 'Generating...',
      prompt: '',
      url: '',
      model: '',
      ratio: '1:1',
      style: '',
      ...source,
      _generating: true
    })
    commitAssets(prev => [item, ...prev], options)
    return item.id
  }, [commitAssets])

  const removeAsset = useCallback(/** @param {string} id @param {AssetMutationOptions} [options] */ (id, options = {}) => {
    commitAssets(prev => prev.filter(a => a.id !== id), options)
    setSelectedId(prev => prev === id ? null : prev)
  }, [commitAssets])

  const replaceAssets = useCallback(/** @param {unknown} nextAssets */ (nextAssets) => {
    const normalized = normalizeAssets(nextAssets)
    undoStack.current = []
    redoStack.current = []
    setAssets(normalized)
    return normalized
  }, [])

  const updateAsset = useCallback(/** @param {string} id @param {unknown} patch @param {AssetMutationOptions} [options] */ (id, patch, options = {}) => {
    commitAssets(prev => prev.map(a => a.id === id ? mergeAsset(a, patch) : a), options)
  }, [commitAssets])

  const updateAssets = useCallback(/** @param {unknown} patches @param {AssetMutationOptions} [options] */ (patches, options = {}) => {
    const patchMap = isRecord(patches) ? patches : {}
    commitAssets(prev => prev.map(a => patchMap[a.id] ? mergeAsset(a, patchMap[a.id]) : a), options)
  }, [commitAssets])

  const getAssetById = useCallback(/** @param {string} id */ (id) => assets.find(a => a.id === id), [assets])

  const clear = useCallback(() => {
    commitAssets([], { history: true })
    setSelectedId(null)
  }, [commitAssets])

  const undo = useCallback(() => {
    setAssets(prev => {
      if (undoStack.current.length === 0) return prev
      const next = undoStack.current.pop()
      if (!next) return prev
      redoStack.current.push(cloneAssets(prev))
      return cloneAssets(next)
    })
  }, [])

  const redo = useCallback(() => {
    setAssets(prev => {
      if (redoStack.current.length === 0) return prev
      const next = redoStack.current.pop()
      if (!next) return prev
      undoStack.current.push(cloneAssets(prev))
      return cloneAssets(next)
    })
  }, [])

  const selectedAsset = assets.find(a => a.id === selectedId) || null
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
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
    addAssets,
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
  }), [sortedAssets, assets, selectedAsset, selectedId, viewMode, addAsset, addAssets, addPlaceholder, removeAsset, replaceAssets, updateAsset, updateAssets, getAssetById, undo, redo, clear])
}
