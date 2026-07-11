export type Track = 'chat' | 'image' | 'video'
export type ProviderAction = 'chat' | 'generate' | 'submit' | 'poll'
export type AssetType = 'image' | 'video'
export type MessageRole = 'user' | 'assistant'
export type TaskStatus = 'pending' | 'generating' | 'queued' | 'running' | 'done' | 'error' | 'partial'

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
  createdAt?: string
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
  baseUrl?: string
  model?: string
  apiKey?: string
  token?: string
  accessKey?: string
  secretKey?: string
  [key: string]: unknown
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
  connections?: ProviderConnectionsConfig
  [key: string]: unknown
}
