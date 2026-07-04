import type {
  Asset,
  AssetType,
  ConfigPayload,
  Conversation,
  ConversationStorePayload,
  Message,
  ProviderCallParams,
  ProviderCallResult,
  ProviderProfile
} from './domain'

export interface ImportConversationResult {
  canceled: boolean
  data?: Conversation | Conversation[] | { conversation?: Conversation; conversations?: Conversation[] }
}

export interface ExportMediaSummary {
  inlined?: number
  skipped?: number
  fallback?: boolean
}

export interface ExportConversationResult {
  canceled: boolean
  filePath?: string
  media?: ExportMediaSummary
  count?: number
}

export interface SaveAssetParams {
  url: string
  label?: string
  type: AssetType
}

export interface ChatMessageInput {
  role: string
  content: string
}

export interface ElectronAPI {
  minimize(): void
  maximize(): void
  close(): void
  isMaximized(): Promise<boolean>

  getConfig(): Promise<ConfigPayload>
  saveConfig(cfg: ConfigPayload): Promise<void>

  getHistory(): Promise<unknown>
  saveHistory(records: unknown): Promise<void>

  loadConversations(): Promise<ConversationStorePayload | null>
  saveConversation(id: string, data: Partial<Conversation>): Promise<void>
  deleteConversation(id: string): Promise<void>
  setActiveConversation(id: string): Promise<void>
  exportConversation(conversation: Partial<Conversation> & { messages?: Message[]; assets?: Asset[] }): Promise<ExportConversationResult>
  exportProject(conversations: Conversation[]): Promise<ExportConversationResult>
  importConversation(): Promise<ImportConversationResult>

  chat(messages: { history?: ChatMessageInput[]; system?: string; thinking?: boolean } | ChatMessageInput[] | Message[], provider?: ProviderProfile): Promise<unknown>
  generateImage(params: ProviderProfile & Record<string, unknown>): Promise<string>
  generateVideo(params: ProviderProfile & Record<string, unknown>): Promise<unknown>
  pollVideoTask(taskId: string, provider?: ProviderProfile): Promise<unknown>
  fetchModels(provider: ProviderProfile): Promise<unknown>

  providerAPI?: {
    call<T = unknown>(params: ProviderCallParams): Promise<ProviderCallResult<T>>
    list(action: string): Promise<unknown>
    test(params: ProviderProfile & Record<string, unknown>): Promise<unknown>
  }

  saveAssetToDisk(params: SaveAssetParams): Promise<string>
  saveAssetWithDialog(params: SaveAssetParams): Promise<{ canceled: boolean; filePath?: string }>
  getSaveDir(): Promise<string>

  openExternal(url: string): Promise<void>
  on(channel: 'window-maximized', callback: (maximized: boolean) => void): (() => void) | undefined
  off(channel: 'window-maximized', handler: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
