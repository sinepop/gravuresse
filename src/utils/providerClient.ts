/**
 * Renderer-side provider call helpers.
 *
 * Prefers the canonical `provider:call` IPC channel (routes through
 * config-resolver → provider pipeline). Falls back to legacy `api:*` channels
 * only when the main-process provider API is unavailable or the provider is
 * unknown / unsupported (codes in FALLBACK_CODES).
 *
 * Legacy fallbacks are kept for packaged-app compatibility; new call sites
 * should use callProvider / callChatProvider directly and rely on the primary
 * path.
 */
import { resolveProviderId } from '../providers/aliases'
import type { ProviderCallParams, ProviderCallResult, ProviderProfile } from '../types/domain'

// Error codes that trigger legacy API fallback. These indicate the provider
// pipeline could not resolve a handler (e.g. custom-image without native
// protocol), so the older direct IPC channels may still work.
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
    baseUrl: task.provider?.baseUrl,
    accountId: task.provider?.accountId as string | undefined
  }, () => window.electronAPI!.pollVideoTask(task.taskId, task.provider) as Promise<T>)
}
