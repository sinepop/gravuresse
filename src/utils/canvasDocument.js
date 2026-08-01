// @ts-check

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {import('../types/domain').CanvasDocument} CanvasDocument */
/** @typedef {import('../types/domain').CanvasDocumentItem} CanvasDocumentItem */
/** @typedef {import('../types/domain').CanvasDrawingItem} CanvasDrawingItem */
/** @typedef {import('../types/domain').CanvasToolState} CanvasToolState */
/** @typedef {import('../types/domain').CanvasViewMode} CanvasViewMode */
/** @typedef {Record<string, unknown>} UnknownRecord */

export const CANVAS_DOCUMENT_SCHEMA_VERSION = 1
export const CANVAS_DEFAULT_VIEW_MODE = 'grid'
export const CANVAS_DEFAULT_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1 })
export const CANVAS_DEFAULT_OVERLAYS = Object.freeze({ lineage: false })
export const CANVAS_DEFAULT_TOOL_STATE = Object.freeze({
  activeTool: 'select',
  drawColor: '#E8A849',
  drawWidth: 2
})

const VALID_VIEW_MODES = new Set(['grid', 'free'])
const VALID_TOOLS = new Set(['select', 'move', 'pencil', 'rect', 'circle', 'line', 'text'])
const VALID_DRAWING_TOOLS = new Set(['pencil', 'rect', 'circle', 'line', 'text'])
const MAX_COORD = 1_000_000
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const MAX_ITEMS = 5000
const MAX_POINTS_PER_DRAWING = 2000

let _canvasIdCounter = 0
let _drawingIdCounter = 0

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {string | null} */
function toId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value)
  return text ? text.slice(0, 200) : null
}

/** @param {unknown} value @param {number} fallback @returns {number} */
function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(-MAX_COORD, Math.min(MAX_COORD, number))
}

/** @param {unknown} value @param {number} fallback @returns {number} */
function positiveNumber(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.min(MAX_COORD, number)
}

/** @param {unknown} value @param {number} fallback @returns {number} */
function zoomNumber(value, fallback = CANVAS_DEFAULT_VIEWPORT.zoom) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, number))
}

/** @param {unknown} value @param {string} fallback @returns {string} */
function colorText(value, fallback = CANVAS_DEFAULT_TOOL_STATE.drawColor) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback
}

/** @param {unknown} value @param {string} fallback @returns {string} */
function textValue(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 50000) : fallback
}

/** @param {unknown} value @returns {CanvasViewMode} */
export function normalizeCanvasViewMode(value) {
  return VALID_VIEW_MODES.has(String(value)) ? /** @type {CanvasViewMode} */ (String(value)) : CANVAS_DEFAULT_VIEW_MODE
}

/** @param {unknown} value @returns {value is CanvasViewMode} */
export function isCanvasViewMode(value) {
  return VALID_VIEW_MODES.has(String(value))
}

/** @param {unknown} value @returns {value is CanvasToolState['activeTool']} */
export function isCanvasTool(value) {
  return VALID_TOOLS.has(String(value))
}

/** @param {unknown} value @returns {{ x: number, y: number, zoom: number }} */
function normalizeViewport(value) {
  const record = isRecord(value) ? value : {}
  return {
    x: finiteNumber(record.x, CANVAS_DEFAULT_VIEWPORT.x),
    y: finiteNumber(record.y, CANVAS_DEFAULT_VIEWPORT.y),
    zoom: zoomNumber(record.zoom, CANVAS_DEFAULT_VIEWPORT.zoom)
  }
}

/** @param {unknown} value @returns {{ lineage: boolean }} */
function normalizeOverlays(value) {
  const record = isRecord(value) ? value : {}
  return { lineage: record.lineage === true }
}

/** @param {unknown} value @returns {CanvasToolState} */
function normalizeToolState(value) {
  const record = isRecord(value) ? value : {}
  const width = Number(record.drawWidth)
  return {
    activeTool: VALID_TOOLS.has(String(record.activeTool))
      ? /** @type {CanvasToolState['activeTool']} */ (String(record.activeTool))
      : CANVAS_DEFAULT_TOOL_STATE.activeTool,
    drawColor: colorText(record.drawColor),
    drawWidth: Number.isFinite(width) && width > 0 ? Math.min(32, Math.max(1, width)) : CANVAS_DEFAULT_TOOL_STATE.drawWidth
  }
}

/** @param {unknown} value @returns {{ x: number, y: number } | null} */
function normalizePoint(value) {
  if (!isRecord(value)) return null
  return { x: finiteNumber(value.x), y: finiteNumber(value.y) }
}

/** @param {unknown} value @returns {CanvasDrawingItem['style']} */
function normalizeDrawingStyle(value) {
  const record = isRecord(value) ? value : {}
  const strokeWidth = Number(record.strokeWidth)
  const fontSize = Number(record.fontSize)
  return {
    ...(typeof record.strokeColor === 'string' ? { strokeColor: colorText(record.strokeColor) } : {}),
    ...(typeof record.fillColor === 'string' ? { fillColor: colorText(record.fillColor) } : {}),
    ...(Number.isFinite(strokeWidth) && strokeWidth > 0 ? { strokeWidth: Math.min(32, Math.max(1, strokeWidth)) } : {}),
    ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize: Math.min(256, Math.max(8, fontSize)) } : {})
  }
}

/** @param {string} entityId @returns {string} */
export function canvasAssetItemId(entityId) {
  return `canvas_asset_${entityId}`
}

/** @returns {string} */
export function makeCanvasDocumentId() {
  return `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${(++_canvasIdCounter) % 1000}`
}

/** @returns {string} */
export function makeCanvasDrawingId() {
  return `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${(++_drawingIdCounter) % 1000}`
}

/** @param {Asset[]} assets @param {string} entityId @returns {number} */
function assetIndex(assets, entityId) {
  const index = assets.findIndex(asset => asset.id === entityId)
  return index >= 0 ? index : assets.length
}

/** @param {Asset[]} assets @param {string} entityId @returns {{ x: number, y: number }} */
export function defaultAssetCanvasPosition(assets = [], entityId = '') {
  const index = assetIndex(assets, entityId)
  const col = index % 4
  const row = Math.floor(index / 4)
  return { x: 30 + col * 280, y: 30 + row * 280 }
}

/**
 * @param {UnknownRecord} item
 * @param {{ assets: Asset[], assetIds: Set<string> }} context
 * @returns {CanvasDocumentItem | null}
 */
function normalizeCanvasItem(item, context) {
  const kind = item.kind === 'drawing' ? 'drawing' : item.kind === 'asset' ? 'asset' : ''
  if (kind === 'asset') {
    const entityId = toId(item.entityId)
    if (!entityId || !context.assetIds.has(entityId)) return null
    const fallback = defaultAssetCanvasPosition(context.assets, entityId)
    return {
      id: toId(item.id) || canvasAssetItemId(entityId),
      kind: 'asset',
      entityId,
      x: finiteNumber(item.x, fallback.x),
      y: finiteNumber(item.y, fallback.y),
      ...(Number.isFinite(Number(item.width)) ? { width: positiveNumber(item.width) } : {}),
      ...(Number.isFinite(Number(item.height)) ? { height: positiveNumber(item.height) } : {}),
      ...(Number.isFinite(Number(item.zIndex)) ? { zIndex: finiteNumber(item.zIndex) } : {})
    }
  }

  if (kind === 'drawing') {
    const tool = VALID_DRAWING_TOOLS.has(String(item.tool))
      ? /** @type {CanvasDrawingItem['tool']} */ (String(item.tool))
      : null
    if (!tool) return null
    const points = /** @type {{ x: number, y: number }[]} */ ((Array.isArray(item.points) ? item.points : [])
      .slice(0, MAX_POINTS_PER_DRAWING)
      .map(normalizePoint)
      .filter(Boolean))
    const text = textValue(item.text)
    if (tool === 'pencil' && points.length < 2) return null
    if (tool === 'text' && !text.trim()) return null
    return {
      id: toId(item.id) || makeCanvasDrawingId(),
      kind: 'drawing',
      tool,
      x: finiteNumber(item.x),
      y: finiteNumber(item.y),
      ...(Number.isFinite(Number(item.width)) ? { width: finiteNumber(item.width) } : {}),
      ...(Number.isFinite(Number(item.height)) ? { height: finiteNumber(item.height) } : {}),
      ...(points.length > 0 ? { points } : {}),
      ...(text ? { text } : {}),
      style: normalizeDrawingStyle(item.style),
      ...(Number.isFinite(Number(item.zIndex)) ? { zIndex: finiteNumber(item.zIndex) } : {})
    }
  }

  return null
}

/**
 * @param {CanvasDocumentItem[]} items
 * @param {Asset[]} assets
 * @returns {CanvasDocumentItem[]}
 */
function ensureAssetItems(items, assets) {
  /** @type {CanvasDocumentItem[]} */
  const next = []
  const seenAssetIds = new Set()
  const seenItemIds = new Set()
  for (const item of items) {
    const id = item.id || (item.kind === 'asset' ? canvasAssetItemId(item.entityId) : makeCanvasDrawingId())
    if (seenItemIds.has(id)) continue
    if (item.kind === 'asset' && seenAssetIds.has(item.entityId)) continue
    seenItemIds.add(id)
    next.push({ ...item, id })
    if (item.kind === 'asset') seenAssetIds.add(item.entityId)
  }
  for (const asset of assets) {
    if (!asset?.id || seenAssetIds.has(asset.id)) continue
    const fallback = defaultAssetCanvasPosition(assets, asset.id)
    /** @type {CanvasDocumentItem} */
    const assetItem = {
      id: canvasAssetItemId(asset.id),
      kind: 'asset',
      entityId: asset.id,
      x: Number.isFinite(Number(asset.x)) ? Number(asset.x) : fallback.x,
      y: Number.isFinite(Number(asset.y)) ? Number(asset.y) : fallback.y
    }
    next.push(assetItem)
  }
  return next.slice(0, MAX_ITEMS)
}

/**
 * @param {Asset[]} assets
 * @param {CanvasDocument | null | undefined} document
 * @returns {Asset[]}
 */
export function hydrateAssetsFromCanvasDocument(assets = [], document = null) {
  const itemByAssetId = new Map(
    (Array.isArray(document?.items) ? document.items : [])
      .filter(item => item?.kind === 'asset' && item.entityId)
      .map(item => [/** @type {import('../types/domain').CanvasAssetItem} */ (item).entityId, item])
  )
  return assets.map((asset, index) => {
    const item = itemByAssetId.get(asset.id)
    if (item) return { ...asset, x: item.x, y: item.y }
    if (Number.isFinite(Number(asset.x)) && Number.isFinite(Number(asset.y))) return asset
    const fallback = defaultAssetCanvasPosition(assets, asset.id || String(index))
    return { ...asset, x: fallback.x, y: fallback.y }
  })
}

/**
 * @param {string} conversationId
 * @param {Asset[]} [assets=[]]
 * @param {Partial<CanvasDocument>} [options={}]
 * @returns {CanvasDocument}
 */
export function createCanvasDocument(conversationId, assets = [], options = {}) {
  const id = toId(options.id) || makeCanvasDocumentId()
  const now = textValue(options.updatedAt) || new Date().toISOString()
  return normalizeCanvasDocument({
    schemaVersion: CANVAS_DOCUMENT_SCHEMA_VERSION,
    id,
    conversationId,
    viewMode: options.viewMode || CANVAS_DEFAULT_VIEW_MODE,
    viewport: options.viewport || CANVAS_DEFAULT_VIEWPORT,
    overlays: options.overlays || CANVAS_DEFAULT_OVERLAYS,
    toolState: options.toolState || CANVAS_DEFAULT_TOOL_STATE,
    items: options.items || [],
    updatedAt: now
  }, { conversationId, assets, now })
}

/**
 * @param {unknown} document
 * @param {{ conversationId: string, assets?: Asset[], fallbackViewMode?: unknown, now?: string }} context
 * @returns {CanvasDocument}
 */
export function normalizeCanvasDocument(document, context) {
  const assets = Array.isArray(context.assets) ? context.assets : []
  const now = context.now || new Date().toISOString()
  const record = isRecord(document) ? document : {}
  const assetIds = new Set(assets.map(asset => asset.id).filter(Boolean))
  const rawItems = Array.isArray(record.items) ? record.items.slice(0, MAX_ITEMS) : []
  const normalizedItems = /** @type {CanvasDocumentItem[]} */ (rawItems
    .filter(isRecord)
    .map(item => normalizeCanvasItem(item, { assets, assetIds }))
    .filter(Boolean))
  return {
    schemaVersion: CANVAS_DOCUMENT_SCHEMA_VERSION,
    id: toId(record.id) || makeCanvasDocumentId(),
    conversationId: context.conversationId || toId(record.conversationId) || '',
    viewMode: isCanvasViewMode(record.viewMode) ? /** @type {CanvasViewMode} */ (record.viewMode) : normalizeCanvasViewMode(context.fallbackViewMode),
    viewport: normalizeViewport(record.viewport),
    overlays: normalizeOverlays(record.overlays),
    toolState: normalizeToolState(record.toolState),
    items: ensureAssetItems(normalizedItems, assets),
    updatedAt: textValue(record.updatedAt) || now
  }
}

/**
 * @param {CanvasDocument | null | undefined} document
 * @param {Asset[]} assets
 * @returns {CanvasDocument}
 */
export function normalizeCanvasDocumentWithAssets(document, assets = []) {
  const conversationId = document?.conversationId || ''
  return normalizeCanvasDocument(document, { conversationId, assets })
}

/**
 * @param {CanvasDocument} document
 * @param {Partial<CanvasDocument>} patch
 * @param {Asset[]} assets
 * @returns {CanvasDocument}
 */
function patchDocument(document, patch, assets = []) {
  return normalizeCanvasDocument({ ...document, ...patch, updatedAt: new Date().toISOString() }, {
    conversationId: document.conversationId,
    assets,
    fallbackViewMode: document.viewMode
  })
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {CanvasViewMode} mode
 * @returns {CanvasDocument}
 */
export function setCanvasViewMode(document, assets, mode) {
  return patchDocument(document, { viewMode: normalizeCanvasViewMode(mode) }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {Partial<CanvasDocument['viewport']>} viewport
 * @returns {CanvasDocument}
 */
export function setCanvasViewport(document, assets, viewport) {
  return patchDocument(document, { viewport: normalizeViewport({ ...document.viewport, ...viewport }) }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {boolean} visible
 * @returns {CanvasDocument}
 */
export function setCanvasLineageVisible(document, assets, visible) {
  return patchDocument(document, { overlays: { ...document.overlays, lineage: visible === true } }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {Partial<CanvasToolState>} toolState
 * @returns {CanvasDocument}
 */
export function setCanvasToolState(document, assets, toolState) {
  return patchDocument(document, { toolState: normalizeToolState({ ...document.toolState, ...toolState }) }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {string} assetId
 * @param {unknown} patch
 * @returns {CanvasDocument}
 */
export function updateCanvasAssetItem(document, assets, assetId, patch = {}) {
  const entityId = toId(assetId)
  if (!entityId) return normalizeCanvasDocument(document, { conversationId: document.conversationId, assets })
  const patchRecord = isRecord(patch) ? patch : {}
  const fallback = defaultAssetCanvasPosition(assets, entityId)
  let found = false
  const items = document.items.map(item => {
    if (item.kind !== 'asset' || item.entityId !== entityId) return item
    found = true
    return {
      ...item,
      x: Number.isFinite(Number(patchRecord.x)) ? finiteNumber(patchRecord.x, fallback.x) : item.x,
      y: Number.isFinite(Number(patchRecord.y)) ? finiteNumber(patchRecord.y, fallback.y) : item.y,
      ...(Number.isFinite(Number(patchRecord.width)) ? { width: positiveNumber(patchRecord.width) } : {}),
      ...(Number.isFinite(Number(patchRecord.height)) ? { height: positiveNumber(patchRecord.height) } : {}),
      ...(Number.isFinite(Number(patchRecord.zIndex)) ? { zIndex: finiteNumber(patchRecord.zIndex) } : {})
    }
  })
  if (!found) {
    items.push({
      id: canvasAssetItemId(entityId),
      kind: 'asset',
      entityId,
      x: Number.isFinite(Number(patchRecord.x)) ? finiteNumber(patchRecord.x, fallback.x) : fallback.x,
      y: Number.isFinite(Number(patchRecord.y)) ? finiteNumber(patchRecord.y, fallback.y) : fallback.y
    })
  }
  return patchDocument(document, { items }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {string} assetId
 * @returns {CanvasDocument}
 */
export function removeCanvasAssetItem(document, assets, assetId) {
  const entityId = toId(assetId)
  if (!entityId) return normalizeCanvasDocument(document, { conversationId: document.conversationId, assets })
  return patchDocument(document, {
    items: document.items.filter(item => item.kind !== 'asset' || item.entityId !== entityId)
  }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @param {unknown} item
 * @returns {CanvasDocument}
 */
export function addCanvasDrawingItem(document, assets, item) {
  const normalized = isRecord(item)
    ? normalizeCanvasItem({ ...item, kind: 'drawing', id: item.id || makeCanvasDrawingId() }, { assets, assetIds: new Set(assets.map(asset => asset.id)) })
    : null
  if (!normalized) return normalizeCanvasDocument(document, { conversationId: document.conversationId, assets })
  return patchDocument(document, { items: [...document.items, normalized] }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {Asset[]} assets
 * @returns {CanvasDocument}
 */
export function clearCanvasDrawingItems(document, assets) {
  return patchDocument(document, {
    items: document.items.filter(item => item.kind !== 'drawing')
  }, assets)
}

/**
 * @param {CanvasDocument} document
 * @param {{ conversationId?: string, assetIdMap?: Map<string, string> | Record<string, string>, assets?: Asset[] }} context
 * @returns {CanvasDocument}
 */
export function remapCanvasDocument(document, context = {}) {
  const assetIdMap = context.assetIdMap instanceof Map
    ? context.assetIdMap
    : new Map(Object.entries(isRecord(context.assetIdMap) ? context.assetIdMap : {}))
  const assets = Array.isArray(context.assets) ? context.assets : []
  const items = (Array.isArray(document?.items) ? document.items : []).map(item => {
    if (item.kind !== 'asset') return item
    const mapped = assetIdMap.get(item.entityId) || item.entityId
    return { ...item, id: canvasAssetItemId(mapped), entityId: mapped }
  })
  return normalizeCanvasDocument({ ...document, conversationId: context.conversationId || document?.conversationId || '', items }, {
    conversationId: context.conversationId || document?.conversationId || '',
    assets,
    fallbackViewMode: document?.viewMode
  })
}
