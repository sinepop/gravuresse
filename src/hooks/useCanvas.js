// @ts-check

import { useState, useCallback, useMemo, useRef } from 'react'
import { createAsset, mergeAsset } from '../utils/assetFactory'
import {
  addCanvasDrawingItem,
  clearCanvasDrawingItems,
  createCanvasDocument,
  hydrateAssetsFromCanvasDocument,
  normalizeCanvasDocument,
  removeCanvasAssetItem,
  setCanvasLineageVisible,
  setCanvasToolState,
  setCanvasViewport,
  setCanvasViewMode,
  updateCanvasAssetItem
} from '../utils/canvasDocument'

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {import('../types/domain').AssetMutationOptions} AssetMutationOptions */
/** @typedef {import('../types/domain').CanvasController} CanvasController */
/** @typedef {import('../types/domain').CanvasDocument} CanvasDocument */
/** @typedef {import('../types/domain').CanvasDrawingItem} CanvasDrawingItem */
/** @typedef {import('../types/domain').CanvasToolState} CanvasToolState */
/** @typedef {import('../types/domain').CanvasViewport} CanvasViewport */
/** @typedef {import('../types/domain').CanvasViewMode} CanvasViewMode */
/** @typedef {{ assets: Asset[], canvasDocument: CanvasDocument }} CanvasSnapshot */
/** @typedef {Record<string, unknown>} UnknownRecord */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {boolean} */
function hasCanvasItemPatch(value) {
  if (!isRecord(value)) return false
  return ['x', 'y', 'width', 'height', 'zIndex'].some(key => Object.prototype.hasOwnProperty.call(value, key))
}

/** @template T @param {T} value @returns {T} */
function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

/** @param {unknown} assets @returns {Asset[]} */
function normalizeAssets(assets) {
  return Array.isArray(assets) ? assets.map(asset => createAsset(asset)) : []
}

/**
 * @param {unknown} assets
 * @param {unknown} canvasDocument
 * @param {string} conversationId
 * @param {CanvasViewMode | undefined} [fallbackViewMode]
 * @returns {CanvasSnapshot}
 */
function normalizeSnapshot(assets, canvasDocument, conversationId, fallbackViewMode) {
  const normalizedAssets = normalizeAssets(assets)
  const normalizedDocument = normalizeCanvasDocument(canvasDocument, {
    conversationId,
    assets: normalizedAssets,
    fallbackViewMode
  })
  const hydratedAssets = hydrateAssetsFromCanvasDocument(normalizedAssets, normalizedDocument)
  const syncedDocument = normalizeCanvasDocument(normalizedDocument, {
    conversationId,
    assets: hydratedAssets,
    fallbackViewMode: normalizedDocument.viewMode
  })
  return { assets: hydratedAssets, canvasDocument: syncedDocument }
}

/** @returns {CanvasSnapshot} */
function initialSnapshot() {
  return normalizeSnapshot([], createCanvasDocument('', []), '')
}

/** @returns {CanvasController} */
export default function useCanvas() {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null))
  const undoStack = useRef(/** @type {CanvasSnapshot[]} */ ([]))
  const redoStack = useRef(/** @type {CanvasSnapshot[]} */ ([]))

  const commitSnapshot = useCallback(/** @param {CanvasSnapshot | ((snapshot: CanvasSnapshot) => CanvasSnapshot)} updater @param {AssetMutationOptions} [options] */ (updater, options = {}) => {
    setSnapshot(prev => {
      const draft = typeof updater === 'function' ? updater(prev) : updater
      const conversationId = draft.canvasDocument?.conversationId || prev.canvasDocument.conversationId
      const next = normalizeSnapshot(draft.assets, draft.canvasDocument, conversationId, prev.canvasDocument.viewMode)
      if (options.history === true) {
        undoStack.current.push(clone(prev))
        if (undoStack.current.length > 80) undoStack.current.shift()
        redoStack.current = []
      }
      return next
    })
  }, [])

  const addAsset = useCallback(/** @param {unknown} asset @param {AssetMutationOptions} [options] */ (asset, options = {}) => {
    const item = createAsset(asset)
    commitSnapshot(prev => ({
      ...prev,
      assets: [item, ...prev.assets],
      canvasDocument: normalizeCanvasDocument(prev.canvasDocument, {
        conversationId: prev.canvasDocument.conversationId,
        assets: [item, ...prev.assets],
        fallbackViewMode: prev.canvasDocument.viewMode
      })
    }), options)
    return item
  }, [commitSnapshot])

  const addAssets = useCallback(/** @param {unknown[]} nextAssets @param {AssetMutationOptions} [options] */ (nextAssets, options = {}) => {
    const items = Array.isArray(nextAssets) ? nextAssets.map(asset => createAsset(asset)) : []
    if (items.length > 0) {
      commitSnapshot(prev => {
        const assets = [...items, ...prev.assets]
        return {
          assets,
          canvasDocument: normalizeCanvasDocument(prev.canvasDocument, {
            conversationId: prev.canvasDocument.conversationId,
            assets,
            fallbackViewMode: prev.canvasDocument.viewMode
          })
        }
      }, options)
    }
    return items
  }, [commitSnapshot])

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
    commitSnapshot(prev => {
      const assets = [item, ...prev.assets]
      return {
        assets,
        canvasDocument: normalizeCanvasDocument(prev.canvasDocument, {
          conversationId: prev.canvasDocument.conversationId,
          assets,
          fallbackViewMode: prev.canvasDocument.viewMode
        })
      }
    }, options)
    return item.id
  }, [commitSnapshot])

  const removeAsset = useCallback(/** @param {string} id @param {AssetMutationOptions} [options] */ (id, options = {}) => {
    commitSnapshot(prev => {
      const assets = prev.assets.filter(asset => asset.id !== id)
      return {
        assets,
        canvasDocument: removeCanvasAssetItem(prev.canvasDocument, assets, id)
      }
    }, options)
    setSelectedId(prev => prev === id ? null : prev)
  }, [commitSnapshot])

  const replaceSnapshot = useCallback(/** @param {{ conversationId: string, assets: unknown, canvasDocument?: unknown }} next */ (next) => {
    const normalized = normalizeSnapshot(next.assets, next.canvasDocument, next.conversationId || '')
    undoStack.current = []
    redoStack.current = []
    setSnapshot(normalized)
    setSelectedId(null)
    return normalized.assets
  }, [])

  const replaceAssets = useCallback(/** @param {unknown} nextAssets */ (nextAssets) => {
    const normalized = normalizeSnapshot(nextAssets, snapshot.canvasDocument, snapshot.canvasDocument.conversationId, snapshot.canvasDocument.viewMode)
    undoStack.current = []
    redoStack.current = []
    setSnapshot(normalized)
    setSelectedId(null)
    return normalized.assets
  }, [snapshot.canvasDocument])

  const updateAsset = useCallback(/** @param {string} id @param {unknown} patch @param {AssetMutationOptions} [options] */ (id, patch, options = {}) => {
    commitSnapshot(prev => {
      const assets = prev.assets.map(asset => asset.id === id ? mergeAsset(asset, patch) : asset)
      return {
        assets,
        canvasDocument: hasCanvasItemPatch(patch)
          ? updateCanvasAssetItem(prev.canvasDocument, assets, id, patch)
          : normalizeCanvasDocument(prev.canvasDocument, {
              conversationId: prev.canvasDocument.conversationId,
              assets,
              fallbackViewMode: prev.canvasDocument.viewMode
            })
      }
    }, options)
  }, [commitSnapshot])

  const updateAssets = useCallback(/** @param {unknown} patches @param {AssetMutationOptions} [options] */ (patches, options = {}) => {
    const patchMap = isRecord(patches) ? patches : {}
    commitSnapshot(prev => {
      const assets = prev.assets.map(asset => patchMap[asset.id] ? mergeAsset(asset, patchMap[asset.id]) : asset)
      let canvasDocument = normalizeCanvasDocument(prev.canvasDocument, {
        conversationId: prev.canvasDocument.conversationId,
        assets,
        fallbackViewMode: prev.canvasDocument.viewMode
      })
      for (const [assetId, patch] of Object.entries(patchMap)) {
        if (hasCanvasItemPatch(patch)) {
          canvasDocument = updateCanvasAssetItem(canvasDocument, assets, assetId, patch)
        }
      }
      return { assets, canvasDocument }
    }, options)
  }, [commitSnapshot])

  const moveAsset = useCallback(/** @param {string} id @param {number} x @param {number} y @param {AssetMutationOptions} [options] */ (id, x, y, options = {}) => {
    updateAsset(id, { x, y }, options)
  }, [updateAsset])

  const setViewMode = useCallback(/** @param {CanvasViewMode} mode */ (mode) => {
    commitSnapshot(prev => ({
      ...prev,
      canvasDocument: setCanvasViewMode(prev.canvasDocument, prev.assets, mode)
    }))
  }, [commitSnapshot])

  const setViewport = useCallback(/** @param {Partial<CanvasViewport>} viewport */ (viewport) => {
    commitSnapshot(prev => ({
      ...prev,
      canvasDocument: setCanvasViewport(prev.canvasDocument, prev.assets, viewport)
    }))
  }, [commitSnapshot])

  const setLineageVisible = useCallback(/** @param {boolean} visible */ (visible) => {
    commitSnapshot(prev => ({
      ...prev,
      canvasDocument: setCanvasLineageVisible(prev.canvasDocument, prev.assets, visible)
    }))
  }, [commitSnapshot])

  const setToolState = useCallback(/** @param {Partial<CanvasToolState>} toolState */ (toolState) => {
    commitSnapshot(prev => ({
      ...prev,
      canvasDocument: setCanvasToolState(prev.canvasDocument, prev.assets, toolState)
    }))
  }, [commitSnapshot])

  const addDrawing = useCallback(/** @param {Partial<CanvasDrawingItem>} item */ (item) => {
    commitSnapshot(prev => ({
      ...prev,
      canvasDocument: addCanvasDrawingItem(prev.canvasDocument, prev.assets, item)
    }), { history: true })
  }, [commitSnapshot])

  const clearDrawings = useCallback(() => {
    commitSnapshot(prev => ({
      ...prev,
      canvasDocument: clearCanvasDrawingItems(prev.canvasDocument, prev.assets)
    }), { history: true })
  }, [commitSnapshot])

  const getAssetById = useCallback(/** @param {string} id */ (id) => snapshot.assets.find(a => a.id === id), [snapshot.assets])

  const clear = useCallback(() => {
    commitSnapshot(prev => ({
      assets: [],
      canvasDocument: normalizeCanvasDocument({
        ...prev.canvasDocument,
        items: prev.canvasDocument.items.filter(item => item.kind === 'drawing')
      }, {
        conversationId: prev.canvasDocument.conversationId,
        assets: [],
        fallbackViewMode: prev.canvasDocument.viewMode
      })
    }), { history: true })
    setSelectedId(null)
  }, [commitSnapshot])

  const undo = useCallback(() => {
    setSnapshot(prev => {
      if (undoStack.current.length === 0) return prev
      const next = undoStack.current.pop()
      if (!next) return prev
      redoStack.current.push(clone(prev))
      return clone(next)
    })
  }, [])

  const redo = useCallback(() => {
    setSnapshot(prev => {
      if (redoStack.current.length === 0) return prev
      const next = redoStack.current.pop()
      if (!next) return prev
      undoStack.current.push(clone(prev))
      return clone(next)
    })
  }, [])

  const selectedAsset = snapshot.assets.find(asset => asset.id === selectedId) || null
  const sortedAssets = useMemo(
    () => [...snapshot.assets].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [snapshot.assets]
  )

  return useMemo(() => ({
    assets: sortedAssets,
    allAssets: snapshot.assets,
    canvasDocument: snapshot.canvasDocument,
    selectedAsset,
    selectedId,
    setSelectedId,
    viewMode: snapshot.canvasDocument.viewMode,
    setViewMode,
    setViewport,
    setLineageVisible,
    setToolState,
    moveAsset,
    addDrawing,
    clearDrawings,
    addAsset,
    addAssets,
    addPlaceholder,
    removeAsset,
    replaceAssets,
    replaceSnapshot,
    updateAsset,
    updateAssets,
    getAssetById,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    clear
  }), [sortedAssets, snapshot.assets, snapshot.canvasDocument, selectedAsset, selectedId, setViewMode, setViewport, setLineageVisible, setToolState, moveAsset, addDrawing, clearDrawings, addAsset, addAssets, addPlaceholder, removeAsset, replaceAssets, replaceSnapshot, updateAsset, updateAssets, getAssetById, undo, redo, clear])
}
