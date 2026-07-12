export type Track = 'chat' | 'image' | 'video'
export type ProviderAction = 'chat' | 'generate' | 'submit' | 'poll'
export type AssetType = 'image' | 'video'
export type MessageRole = 'user' | 'assistant'
export type TaskStatus = 'pending' | 'generating' | 'queued' | 'running' | 'done' | 'error' | 'partial'
export type ModelCapability = 'image' | 'chat' | 'other' | 'unknown'

export interface ModelRecord {
  id: string
  capability: ModelCapability
  routeHint: string
  source: string
  reason: string
}

export interface Generation {
  prompt?: string
  negative_prompt?: string
  negativePrompt?: string
  ratio?: string
  resolution?: string
  model?: string
  providerId?: string
  mode?: string
  createdFrom?: string
  duration?: number | string | null
  parentAssetId?: string | null
  sourceAssetIds?: string[]
  promptReferenceAssetIds?: string[]
  taskId?: string | null
}

export interface Asset {
  id: string
  type: AssetType
  url: string
  label?: string
  prompt?: string
  negativePrompt?: string
  model?: string
  ratio?: string
  resolution?: string
  style?: string
  createdAt?: string
  isMaterial?: boolean
  _generating?: boolean
  name?: string
  x?: number
  y?: number
  generation?: Generation
  [key: string]: unknown
}

export interface MessageTask {
  id: string
  type: AssetType
  status: TaskStatus
  label: string
  prompt: string
  review_text?: string
  negative_prompt?: string
  ratio?: string
  duration?: number | string | null
  source_image_id?: string | null
  sourceAssetIds?: string[]
  promptReferenceAssetIds?: string[]
  parentAssetId?: string | null
  taskId?: string | null
  error?: string
  startTime?: number
  elapsed?: number
  batchTotal?: number
  batchDone?: number
  [key: string]: unknown
}

export interface Message {
  id: string | number
  role: MessageRole
  content: string
  thinking?: string
  model?: string
  error?: boolean
  tasks?: MessageTask[]
  task?: MessageTask
  [key: string]: unknown
}

export interface Conversation {
  id?: string
  title: string
  messages: Message[]
  assets: Asset[]
  active?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface ConversationStorePayload {
  schemaVersion?: number
  conversations: Conversation[]
  activeId: string | null
  deletedIds: string[]
}

export interface ProviderProfile {
  id?: string
  providerId?: string
  accountId?: string
  accountKind?: string
  baseUrl?: string
  model?: string
  apiKey?: string
  sessionToken?: string
  token?: string
  accessKey?: string
  secretKey?: string
  name?: string
  profileId?: string
  executable?: boolean
  integrationStatus?: string
  _configProviderIndex?: number
  platform?: string
  nameEn?: string
  nameZh?: string
  defaultModel?: string
  modelCatalog?: string[]
  models?: string[]
  enabled?: boolean
  callMode?: string
  setupMode?: string
  relayCompatible?: boolean
  customizable?: Record<string, unknown>
  capabilities?: Record<string, unknown>
  constraints?: Record<string, unknown>
  links?: Partial<Record<string, string>>
  billing?: Record<string, unknown>
  meta?: Record<string, unknown>
  template?: Record<string, unknown>
  customTemplate?: Record<string, unknown>
  timeout?: number | string
  pollInterval?: number | string
  customSystemPrompt?: string
  defaultNegPrompt?: string
  pathPrefix?: string
  modelListPath?: string
  modelsPath?: string
  defaultUrl?: string
  protocol?: string
  format?: string
  authType?: unknown
  customAuth?: Record<string, unknown>
  [key: string]: unknown
}

export interface ProviderDefinition extends ProviderProfile {}

export type ProviderLists = Partial<Record<Track, ProviderDefinition[]>>

export interface ProviderAccount {
  accountId?: string
  kind?: string
  providerId?: string
  name?: string
  apiKey?: string
  sessionToken?: string
  baseUrl?: string
  model?: string
  modelListPath?: string
  pathPrefix?: string
  authType?: unknown
  customAuth?: Record<string, unknown>
  protocol?: unknown
  format?: unknown
  template?: Record<string, unknown>
  tracks?: Track[]
  status?: string
  [key: string]: unknown
}

export interface StoredConversation extends Conversation {
  id: string
}

export type QueueTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface VideoPollResult {
  status: string
  progress: number
  videoUrl: string
  error: string
  [key: string]: unknown
}

export interface VideoQueueTask {
  id: string
  taskId: string
  prompt: string
  label: string
  provider?: ProviderProfile
  status: QueueTaskStatus
  progress: number
  videoUrl: string
  error: string
  onComplete?: (result: VideoPollResult) => unknown | Promise<unknown>
  onFail?: (error: string) => void
  autoSave?: boolean
  createdAt: string
}

export interface VideoQueueTaskInput {
  taskId: string
  prompt?: string
  label?: string
  provider?: ProviderProfile
  onComplete?: VideoQueueTask['onComplete']
  onFail?: VideoQueueTask['onFail']
  autoSave?: boolean
}

export type CanvasViewMode = 'grid' | 'free'
export interface AssetMutationOptions { history?: boolean }

export interface CanvasController {
  assets: Asset[]
  allAssets: Asset[]
  selectedAsset: Asset | null
  selectedId: string | null
  setSelectedId(id: string | null): void
  viewMode: CanvasViewMode
  setViewMode(mode: CanvasViewMode): void
  addAsset(asset: unknown, options?: AssetMutationOptions): Asset
  addAssets(assets: unknown[], options?: AssetMutationOptions): Asset[]
  addPlaceholder(label: string, asset?: unknown, options?: AssetMutationOptions): string
  removeAsset(id: string, options?: AssetMutationOptions): void
  replaceAssets(assets: unknown): Asset[]
  updateAsset(id: string, patch: unknown, options?: AssetMutationOptions): void
  updateAssets(patches: unknown, options?: AssetMutationOptions): void
  getAssetById(id: string): Asset | undefined
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
  clear(): void
}

export interface ConversationSnapshot {
  messages: Message[]
  assets: Asset[]
}

export interface ConversationBridge {
  canWrite?(conversationId: string): boolean
  appendMessage?(conversationId: string, message: Message): Conversation | boolean | null | void
  updateTask?(conversationId: string, messageId: string | number, taskIndex: number, patch: Partial<MessageTask>): Conversation | boolean | null | void
  addAsset?(conversationId: string, asset: unknown): Asset | null
  updateAsset?(conversationId: string, assetId: string, patch: unknown): Conversation | boolean | null | void
  removeAsset?(conversationId: string, assetId: string): Conversation | boolean | null | void
  getAsset?(conversationId: string, assetId: string): Asset | null
}

export interface GenerationSettings {
  conversationId?: string
  conversationSnapshot?: ConversationSnapshot
  generationMode?: 'chat' | 'image' | 'video'
  ratio?: string
  resolution?: string
  style?: string
  sourceImageId?: string | number | null
  parentAssetId?: string | number | null
  createdFrom?: string
  styleDirection?: string
}

export interface ChatProviderResult {
  text: string
  thinking: string
  model: string
  [key: string]: unknown
}

export interface LastImageContext {
  conversationId: string
  prompt: string
  ratio: string
  assetId: string
}

export interface DirectGenerationOptions {
  conversationId?: string
  createdFrom?: string
  styleDirection?: string
}

export interface ChatController {
  messages: Message[]
  loading: boolean
  send(text: string, references?: Asset[], settings?: GenerationSettings): Promise<boolean | undefined>
  clear(): void
  confirmGenerate(messageId: string | number, task: MessageTask, taskIndex?: number): Promise<void>
  batchGenerate(messageId: string | number, task: MessageTask, count: number, taskIndex?: number): Promise<void>
  regenerateDirectly(asset: Asset, lang: string, options?: DirectGenerationOptions): Promise<void>
  createDerivedImageDirectly(asset: Asset, lang: string, options?: DirectGenerationOptions): Promise<void>
  retryErroredTask(messageId: string | number, task: MessageTask, taskIndex: number | undefined, lang: string): Promise<void>
  setMessages(update: Message[] | ((messages: Message[]) => Message[])): void
  lastImageContext: { current: LastImageContext | null }
  thinking: boolean
  setThinking(value: boolean | ((current: boolean) => boolean)): void
}

export interface ProviderValidationStatus {
  ok: boolean
  status: string
  level: string
  checkedAt: string
  latencyMs: number | null
  endpointHost: string
  modelId: string
  errorCode: string
  message: string
  evidence?: 'assistant_output' | 'protocol_response' | 'model_directory' | 'capability' | 'none'
  outputVerified?: boolean
  protocol?: 'openai' | 'anthropic' | 'gemini' | string
  stage?: 'directory' | 'inference' | string
  endpointPath?: string
  track?: Track
  inventoryRevision?: string
}

export interface RemoteProviderModel {
  id: string
  capability: Track | 'other' | 'unknown'
  routeHint?: string
  source: 'remote'
  reason?: string
}

export interface ProviderConnection {
  id: string
  providerId: string
  name: string
  kind: 'api-key' | 'relay' | 'oauth' | string
  baseUrl?: string
  authType?: { type: string; headerName?: string; paramName?: string; key?: string }
  capabilities: Track[]
  modelsPath?: string
  pathPrefix?: string
  endpoints?: Partial<Record<'chat' | 'image' | 'video' | 'capability' | 'submit' | 'poll', string>>
  template?: Record<string, unknown>
  models?: RemoteProviderModel[]
  validation?: ProviderValidationStatus | null
  validations?: Partial<Record<Track, ProviderValidationStatus>>
  revision?: string
  inventoryRevision?: string
  updatedAt?: string
  apiKey?: string
  sessionToken?: string
  [key: string]: unknown
}

export interface ProviderDefaultSelection {
  connectionId: string
  providerId: string
  modelId: string
}

export interface ProviderConnectionsConfig {
  accounts: ProviderConnection[]
  apiKeys: ProviderConnection[]
  relays: ProviderConnection[]
  defaults: Record<Track, ProviderDefaultSelection | null>
}

export interface ProviderCallParams {
  action: ProviderAction
  providerId?: string
  connectionId?: string
  messages?: Array<{ role: MessageRole | 'system'; content: string }>
  system?: string
  thinking?: boolean
  prompt?: string
  ratio?: string
  resolution?: string
  negative_prompt?: string
  duration?: number | string
  sourceImageUrl?: string
  taskId?: string
  model?: string
  baseUrl?: string
  accountId?: string
  [key: string]: unknown
}

export type ProviderCallResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error?: { code?: string; message?: string; details?: unknown; warnings?: unknown } }

export interface ConfigPayload {
  providers?: Partial<Record<Track, ProviderProfile>>
  providerProfiles?: Partial<Record<Track, ProviderProfile[]>>
  providerAccounts?: ProviderAccount[]
  chatProviders?: ProviderProfile[]
  general?: Record<string, unknown>
  savedChatModel?: string
  connections?: ProviderConnectionsConfig
  [key: string]: unknown
}
