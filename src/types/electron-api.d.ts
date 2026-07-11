import type {
  Asset,
  AssetType,
  ConfigPayload,
  Conversation,
  ConversationStorePayload,
  Message,
  ProviderCallParams,
  ProviderCallResult,
  ProviderProfile,
  ProviderConnection,
  ProviderConnectionsConfig,
  ProviderDefaultSelection,
  ProviderValidationStatus,
  RemoteProviderModel,
  Track
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

export interface ImportedImageRecord {
  url: string
  label: string
  type: 'image'
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
}

export interface ImageImportResult {
  canceled: boolean
  imported: ImportedImageRecord[]
  rejected: Array<{ name: string; reason: string }>
}

export interface ChatMessageInput {
  role: string
  content: string
}

export interface ProviderConnectorStatus extends ProviderValidationStatus {
  id: string
  name: string
  mode: 'oauth' | 'device-code' | 'cli'
  connectionId?: string
  attemptId?: string
  userCode?: string
}

export interface ProviderAuthAttempt {
  id: string
  connectorId: string
  status: string
  createdAt: string
  expiresAt: string
  errorCode: string
  message: string
  authorizationUrl?: string
  verificationUri?: string
  userCode?: string
  redirectUri?: string
  level?: string
  checkedAt?: string
  latencyMs?: number | null
  endpointHost?: string
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
    fetchModels(params: ProviderProfile & Record<string, unknown>): Promise<{ ok: boolean; models?: string[]; message?: string }>
    testConnection(params: ProviderProfile & Record<string, unknown>): Promise<{ ok: boolean; latencyMs?: number; message?: string; evidence?: ProviderValidationStatus['evidence']; outputVerified?: boolean }>
  }

  providerConnection?: {
    list(): Promise<{ connections: ProviderConnectionsConfig; accountConnectors: ProviderConnectorStatus[] }>
    save(params: { collection: 'accounts' | 'apiKeys' | 'relays'; connection: ProviderConnection; track?: Track }): Promise<{ connection: ProviderConnection; modelsResult: ProviderValidationStatus | null }>
    remove(params: { collection: 'accounts' | 'apiKeys' | 'relays'; id: string }): Promise<{ ok: boolean }>
  }
  providerAuth?: {
    begin(params: { connectorId: string }): Promise<ProviderConnectorStatus | ProviderAuthAttempt>
    status(params?: { connectorId?: string; attemptId?: string }): Promise<ProviderConnectorStatus | ProviderConnectorStatus[] | ProviderAuthAttempt | null>
    cancel(params: { attemptId: string }): Promise<ProviderAuthAttempt | { ok: false; status: 'not_found' }>
    disconnect(params: { connectorId: string; connectionId?: string }): Promise<{ ok: boolean; status: string }>
  }
  providerModels?: {
    refresh(params: { connectionId: string; track?: Track }): Promise<{ models: RemoteProviderModel[]; result: ProviderValidationStatus }>
  }
  providerValidation?: {
    run(params: { connectionId: string; track: Track; modelId?: string }): Promise<ProviderValidationStatus>
  }
  providerDefaults?: {
    save(params: { defaults: Record<Track, ProviderDefaultSelection | null> }): Promise<Record<Track, ProviderDefaultSelection | null>>
  }

  saveAssetToDisk(params: SaveAssetParams): Promise<string>
  saveAssetWithDialog(params: SaveAssetParams): Promise<{ canceled: boolean; filePath?: string }>
  cacheAssetPreview(params: SaveAssetParams): Promise<string>
  importLocalImages(): Promise<ImageImportResult>
  importImageBytes(params: { name: string; mime: string; bytes: ArrayBuffer | Uint8Array }): Promise<ImageImportResult>
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
