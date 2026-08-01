import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  shouldAutoSaveHistory,
  titleForConversationSave
} from '../../src/utils/conversationPersistence.js'

const appSource = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8')
const chatSource = await readFile(new URL('../../src/hooks/useChat.js', import.meta.url), 'utf8')
const queueSource = await readFile(new URL('../../src/hooks/useTaskQueue.js', import.meta.url), 'utf8')
const providerIpcSource = await readFile(new URL('../../electron/ipc/provider.js', import.meta.url), 'utf8')
const chatPanelSource = await readFile(new URL('../../src/components/ChatPanel.jsx', import.meta.url), 'utf8')
const canvasPanelSource = await readFile(new URL('../../src/components/CanvasPanel.jsx', import.meta.url), 'utf8')

test('history autosave defaults on but obeys an explicit off switch', () => {
  assert.equal(shouldAutoSaveHistory(undefined), true)
  assert.equal(shouldAutoSaveHistory({}), true)
  assert.equal(shouldAutoSaveHistory({ general: null }), true)
  assert.equal(shouldAutoSaveHistory({ general: { autoSave: true } }), true)
  assert.equal(shouldAutoSaveHistory({ general: { autoSave: false } }), false)
})

test('conversation persistence never overwrites an intentional title', () => {
  const messages = [{ role: 'user', content: 'First generated prompt' }]
  assert.equal(titleForConversationSave({ title: 'Curated title' }, messages), 'Curated title')
  assert.equal(titleForConversationSave({ title: '   ' }, messages), 'First generated prompt')
  assert.equal(titleForConversationSave(null, messages), 'First generated prompt')
})

test('disk autosave, status copy, and composer state share the same history switch', () => {
  assert.match(appSource, /if \(!autoSaveHistory \|\| skipSave\.current \|\| !activeConvId\) return/)
  assert.match(appSource, /if \(autoSaveHistory\) \{\s*await window\.electronAPI\?\.saveConversation/)
  assert.match(appSource, /const autosaveReady = Boolean\(autoSaveHistory && conversationReady\)/)
  assert.match(appSource, /<ChatPanel key=\{activeConvId \|\| 'no-conversation'\}/)
})

test('disabled references cannot remain attached invisibly', () => {
  assert.match(
    chatPanelSource,
    /if \(!enableReference\) \{\s*setReferences\(\[\]\)\s*setShowRefPicker\(false\)/
  )
})

test('video queue removal and restart recovery end in an explicit terminal state', () => {
  assert.match(queueSource, /onRemove: task\.onRemove/)
  assert.match(chatSource, /status: 'error', recoveryStatus: 'not-resumable', queueId: undefined/)
  assert.match(appSource, /classifyVideoRecovery\(task, runtimeConfig\)/)
  assert.match(appSource, /!task\.taskId \|\| !task\.connectionId \|\| !task\.providerId \|\| !task\.model/)
  assert.match(appSource, /const updateRecoveredTask = useCallback/)
  assert.match(appSource, /convId === activeConvIdRef\.current[\s\S]{0,160}setChatMessages\(prev => prev\.map/)
  assert.match(appSource, /const addRecoveredAsset = useCallback/)
  assert.match(appSource, /convId === activeConvIdRef\.current[\s\S]{0,120}canvas\.addAsset\(asset\)/)
  assert.match(appSource, /error: t\('videoRecoveryUnavailable', lang\)/)
  assert.match(appSource, /autoSave: generalConfig\.autoSaveVideo === true/)
  assert.match(appSource, /error: t\('videoPollingStopped', lang\)/)
  assert.match(queueSource, /status: 'unknown'/)
  assert.match(queueSource, /task\.onPollUpdate\?\.\(\{ status: 'unknown'/)
})

test('video settings and legacy IPC preserve every user-visible generation option', () => {
  for (const source of [chatSource, providerIpcSource]) {
    assert.match(source, /resolution:/)
    assert.match(source, /negative_prompt:/)
  }
  assert.match(chatSource, /autoSave: general\.autoSaveVideo === true/)
})

test('batch completion and retry follow the same state and confirmation paths as first execution', () => {
  assert.match(chatSource, /doGenerate\([^)]*\{ finalizeTask: false \}\)/)
  assert.match(chatSource, /status: 'generating', batchDone: done/)
  assert.match(chatSource, /appendTask\(originConversationId, msgId, retryTask\)/)
  assert.match(chatSource, /await confirmGenerate\(msgId, retryTask, nextTaskIndex\)/)
})

test('conversation canvas document rides every persistence boundary', () => {
  assert.match(appSource, /saveConversation\(id, \{ messages, assets, canvasDocument, title \}/)
  assert.match(appSource, /saveConversation\(convId,[\s\S]{0,120}canvasDocument: canvas\.canvasDocument/)
  assert.match(appSource, /exportConversation\?\.\(\{[\s\S]{0,160}canvasDocument: canvas\.canvasDocument/)
  assert.match(appSource, /saveConversation\(conv\.id, \{ messages: conv\.messages, assets: conv\.assets, canvasDocument: conv\.canvasDocument, title: conv\.title \}/)
  assert.match(canvasPanelSource, /\}, \[canvasDocument\.id, canvasDocument\.conversationId\]\)/)
})

test('a stale transient model selection falls back to the stored verified default', () => {
  assert.match(chatSource, /const candidates = \[activeSelections\[track\], connections\.defaults\?\.\[track\]\]/)
  assert.match(chatSource, /validation\.inventoryRevision === connection\?\.inventoryRevision/)
  assert.match(chatSource, /if \(!currentInventory \|\| !connection \|\| !model[^\n]+\) continue/)
})

test('chat loading blocks duplicates only within the same conversation', () => {
  assert.match(chatSource, /inFlightConversationsRef = useRef\(new Set/)
  assert.match(chatSource, /inFlightConversationsRef\.current\.has\(originConversationId\)/)
  assert.match(chatSource, /const activeLoading = Boolean\(activeConversationId && inFlightConversationsRef\.current\.has\(activeConversationId\)\)/)
  assert.match(chatSource, /setConversationLoading\(originConversationId, true\)/)
  assert.match(chatSource, /setConversationLoading\(originConversationId, false\)/)
})
