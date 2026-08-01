// @ts-check

import { createAsset, mergeAsset } from './assetFactory.js'
import { getConversationTitle } from './conversationImport.js'
import {
  normalizeCanvasDocument,
  removeCanvasAssetItem,
  updateCanvasAssetItem
} from './canvasDocument.js'

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {import('../types/domain').Conversation} Conversation */
/** @typedef {import('../types/domain').Message} Message */
/** @typedef {import('../types/domain').MessageTask} MessageTask */
/** @typedef {import('../types/domain').CanvasDocument} CanvasDocument */
/** @typedef {Partial<Conversation> & Record<string, unknown>} ConversationRecord */

/**
 * @param {ConversationRecord} conversation
 * @returns {Message[]}
 */
function messagesOf(conversation = {}) {
  return Array.isArray(conversation.messages) ? conversation.messages : []
}

/**
 * @param {ConversationRecord} conversation
 * @returns {Asset[]}
 */
function assetsOf(conversation = {}) {
  return Array.isArray(conversation.assets) ? conversation.assets : []
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {boolean} */
function hasCanvasItemPatch(value) {
  if (!isRecord(value)) return false
  return ['x', 'y', 'width', 'height', 'zIndex'].some(key => Object.prototype.hasOwnProperty.call(value, key))
}

/**
 * @param {ConversationRecord} conversation
 * @param {Asset[]} assets
 * @returns {CanvasDocument}
 */
function canvasDocumentOf(conversation = {}, assets = assetsOf(conversation)) {
  return normalizeCanvasDocument(conversation.canvasDocument, {
    conversationId: conversation.id ? String(conversation.id) : '',
    assets,
    fallbackViewMode: isRecord(conversation.canvasDocument) ? conversation.canvasDocument.viewMode : undefined
  })
}

/**
 * @param {ConversationRecord} conversation
 * @param {Message} message
 * @returns {ConversationRecord}
 */
export function appendMessageToConversation(conversation = {}, message) {
  const messages = [...messagesOf(conversation), message]
  return {
    ...conversation,
    messages,
    title: conversation.title || getConversationTitle(messages)
  }
}

/**
 * @param {ConversationRecord} conversation
 * @param {string | number} msgId
 * @param {number} [taskIndex=0]
 * @param {Partial<MessageTask>} [patch={}]
 * @returns {ConversationRecord}
 */
export function updateConversationTask(conversation = {}, msgId, taskIndex = 0, patch = {}) {
  return {
    ...conversation,
    messages: messagesOf(conversation).map(message => {
      if (message.id !== msgId) return message
      const tasks = [...(message.tasks || (message.task ? [message.task] : []))]
      tasks[taskIndex ?? 0] = { ...tasks[taskIndex ?? 0], ...patch }
      return { ...message, tasks }
    })
  }
}

/**
 * @param {ConversationRecord} conversation
 * @param {string | number} msgId
 * @param {MessageTask} task
 * @returns {{ conversation: ConversationRecord, taskIndex: number }}
 */
export function appendTaskToConversation(conversation = {}, msgId, task) {
  let taskIndex = -1
  const messages = messagesOf(conversation).map(message => {
    if (message.id !== msgId) return message
    const tasks = [...(message.tasks || (message.task ? [message.task] : []))]
    taskIndex = tasks.length
    tasks.push(task)
    return { ...message, tasks }
  })
  return {
    conversation: {
      ...conversation,
      messages
    },
    taskIndex
  }
}

/**
 * @param {ConversationRecord} conversation
 * @param {unknown} asset
 * @returns {{ conversation: ConversationRecord, asset: Asset }}
 */
export function addAssetToConversationRecord(conversation = {}, asset) {
  const item = createAsset(asset)
  const assets = [item, ...assetsOf(conversation)]
  const canvasDocument = updateCanvasAssetItem(canvasDocumentOf(conversation, assets), assets, item.id, item)
  return {
    conversation: {
      ...conversation,
      assets,
      canvasDocument
    },
    asset: item
  }
}

/**
 * @param {ConversationRecord} conversation
 * @param {string} assetId
 * @param {unknown} [patch={}]
 * @returns {ConversationRecord}
 */
export function updateConversationAsset(conversation = {}, assetId, patch = {}) {
  const assets = assetsOf(conversation).map(asset => asset.id === assetId ? mergeAsset(asset, patch) : asset)
  const baseDocument = canvasDocumentOf(conversation, assets)
  return {
    ...conversation,
    assets,
    canvasDocument: hasCanvasItemPatch(patch) ? updateCanvasAssetItem(baseDocument, assets, assetId, patch) : baseDocument
  }
}

/**
 * @param {ConversationRecord} conversation
 * @param {string} assetId
 * @returns {ConversationRecord}
 */
export function removeConversationAsset(conversation = {}, assetId) {
  const assets = assetsOf(conversation).filter(asset => asset.id !== assetId)
  return {
    ...conversation,
    assets,
    canvasDocument: removeCanvasAssetItem(canvasDocumentOf(conversation, assets), assets, assetId)
  }
}
