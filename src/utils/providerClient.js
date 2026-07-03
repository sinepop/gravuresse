import { resolveProviderId } from '../providers/aliases'

const FALLBACK_CODES = new Set(['UNKNOWN_PROVIDER', 'UNSUPPORTED_ACTION', 'NO_HANDLER'])

export async function callProvider(params, fallback) {
  if (!window.electronAPI?.providerAPI?.call) return fallback()
  const result = await window.electronAPI.providerAPI.call(params)
  if (!result?.ok) {
    if (FALLBACK_CODES.has(result?.error?.code)) return fallback()
    throw new Error(result?.error?.message || 'Provider call failed')
  }
  return result.data
}

export function callChatProvider(params, { history, system, thinking, provider }) {
  return callProvider(params, () => window.electronAPI.chat({ history, system, thinking }, provider))
}

export function generateImageProvider(params, imageParams) {
  return callProvider(params, () => window.electronAPI.generateImage(imageParams))
}

export function submitVideoProvider(params, videoParams) {
  return callProvider(params, () => window.electronAPI.generateVideo(videoParams))
}

export function pollVideoTaskProvider(task) {
  return callProvider({
    action: 'poll',
    providerId: resolveProviderId('video', task.provider?.id),
    taskId: task.taskId,
    model: task.provider?.model,
    baseUrl: task.provider?.baseUrl
  }, () => window.electronAPI.pollVideoTask(task.taskId, task.provider))
}
