import { createAsset, mergeAsset } from './assetFactory.js'
import { getConversationTitle } from './conversationImport.js'

function messagesOf(conversation = {}) {
  return Array.isArray(conversation.messages) ? conversation.messages : []
}

function assetsOf(conversation = {}) {
  return Array.isArray(conversation.assets) ? conversation.assets : []
}

export function appendMessageToConversation(conversation = {}, message) {
  const messages = [...messagesOf(conversation), message]
  return {
    ...conversation,
    messages,
    title: conversation.title || getConversationTitle(messages)
  }
}

export function updateConversationTask(conversation = {}, msgId, taskIndex = 0, patch = {}) {
  return {
    ...conversation,
    messages: messagesOf(conversation).map(message => {
      if (message.id !== msgId) return message
      const tasks = [...(message.tasks || [message.task])]
      tasks[taskIndex ?? 0] = { ...tasks[taskIndex ?? 0], ...patch }
      return { ...message, tasks }
    })
  }
}

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

export function updateConversationAsset(conversation = {}, assetId, patch = {}) {
  return {
    ...conversation,
    assets: assetsOf(conversation).map(asset => asset.id === assetId ? mergeAsset(asset, patch) : asset)
  }
}

export function removeConversationAsset(conversation = {}, assetId) {
  return {
    ...conversation,
    assets: assetsOf(conversation).filter(asset => asset.id !== assetId)
  }
}
