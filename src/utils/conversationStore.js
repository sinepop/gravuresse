// @ts-check

import { createAsset, mergeAsset } from './assetFactory.js'
import { getConversationTitle } from './conversationImport.js'

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {import('../types/domain').Conversation} Conversation */
/** @typedef {import('../types/domain').Message} Message */
/** @typedef {import('../types/domain').MessageTask} MessageTask */
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
 * @param {unknown} asset
 * @returns {{ conversation: ConversationRecord, asset: Asset }}
 */
export function addAssetToConversationRecord(conversation = {}, asset) {
  const item = createAsset(asset)
  return {
    conversation: {
      ...conversation,
      assets: [item, ...assetsOf(conversation)]
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
  return {
    ...conversation,
    assets: assetsOf(conversation).map(asset => asset.id === assetId ? mergeAsset(asset, patch) : asset)
  }
}

/**
 * @param {ConversationRecord} conversation
 * @param {string} assetId
 * @returns {ConversationRecord}
 */
export function removeConversationAsset(conversation = {}, assetId) {
  return {
    ...conversation,
    assets: assetsOf(conversation).filter(asset => asset.id !== assetId)
  }
}
