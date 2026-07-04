import { resolveProviderId } from '../providers/aliases'
import type { ProviderCallParams, ProviderCallResult, ProviderProfile } from '../types/domain'

const FALLBACK_CODES = new Set(['UNKNOWN_PROVIDER', 'UNSUPPORTED_ACTION', 'NO_HANDLER'])

type Fallback<T> = () => Promise<T>

interface ChatFallbackParams {
  history: Array<{ role: string; content: string }>
  system: string
  thinking: boolean
  provider: ProviderProfile
}

export async function callProvider<T>(params: ProviderCallParams, fallback: Fallback<T>): Promise<T> {
  if (!window.electronAPI?.providerAPI?.call) return fallback()
  const result: ProviderCallResult<T> = await window.electronAPI.providerAPI.call<T>(params)
  if (!result.ok) {
    if (FALLBACK_CODES.has(result.error?.code || '')) return fallback()
    throw new Error(result.error?.message || 'Provider call failed')
  }
  return result.data
}

export function callChatProvider<T>(params: ProviderCallParams, { history, system, thinking, provider }: ChatFallbackParams): Promise<T> {
  return callProvider<T>(params, () => window.electronAPI!.chat({ history, system, thinking }, provider) as Promise<T>)
}

export function generateImageProvider(params: ProviderCallParams, imageParams: ProviderProfile & Record<string, unknown>): Promise<string> {
  return callProvider<string>(params, () => window.electronAPI!.generateImage(imageParams))
}

export function submitVideoProvider<T>(params: ProviderCallParams, videoParams: ProviderProfile & Record<string, unknown>): Promise<T> {
  return callProvider<T>(params, () => window.electronAPI!.generateVideo(videoParams) as Promise<T>)
}

export function pollVideoTaskProvider<T>(task: { taskId: string; provider?: ProviderProfile }): Promise<T> {
  return callProvider<T>({
    action: 'poll',
    providerId: resolveProviderId('video', task.provider?.id),
    taskId: task.taskId,
    model: task.provider?.model,
    baseUrl: task.provider?.baseUrl
  }, () => window.electronAPI!.pollVideoTask(task.taskId, task.provider) as Promise<T>)
}
