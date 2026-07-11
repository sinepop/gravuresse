import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/components/settings/RelaysPage.jsx', import.meta.url), 'utf8')
const apiKeysSource = await readFile(new URL('../../src/components/settings/ApiKeysPage.jsx', import.meta.url), 'utf8')
const sharedSource = await readFile(new URL('../../src/components/settings/shared.jsx', import.meta.url), 'utf8')
const settingsSource = await readFile(new URL('../../src/components/Settings.jsx', import.meta.url), 'utf8')
const canvasSource = await readFile(new URL('../../src/components/CanvasPanel.jsx', import.meta.url), 'utf8')
const i18nSource = await readFile(new URL('../../src/i18n.js', import.meta.url), 'utf8')

test('settings keeps General separate from the four provider pages', () => {
  assert.match(settingsSource, /'General'\s*:\s*'\\u901a\\u7528'/)
  assert.match(settingsSource, /'General settings'\s*:\s*'\\u901a\\u7528\\u8bbe\\u7f6e'/)
  assert.doesNotMatch(settingsSource, /Application preferences|\\u5e94\\u7528\\u504f\\u597d/)
  for (const page of ['accounts', 'api-keys', 'relays', 'defaults']) {
    assert.match(settingsSource, new RegExp(`id: '${page}'`))
  }
  assert.match(settingsSource, /<option value="zh">中文<\/option>/)
  assert.doesNotMatch(settingsSource, />\\u[0-9a-fA-F]{4}/)
})

test('settings closes only from an idle explicit backdrop or close action', () => {
  assert.match(settingsSource, /event\.target === event\.currentTarget && !busy/)
  assert.match(settingsSource, /e\.key === 'Escape' && !saving && !pageBusy/)
  assert.match(settingsSource, /const busy = saving \|\| pageBusy/)
  for (const page of ['AccountsPage', 'ApiKeysPage', 'RelaysPage', 'DefaultsPage']) {
    assert.match(settingsSource, new RegExp(`<${page}[^>]+onBusyChange=\\{setPageBusy\\}`))
  }
})

test('canvas uses product language for batch actions and source relationships', () => {
  for (const phrase of ['批量动作', '来源关系', 'Batch Actions', 'Source Links']) assert.match(i18nSource, new RegExp(phrase))
  assert.doesNotMatch(i18nSource, /Agent 队列|Agent Queue|谱系线|Lineage'/)
  assert.match(canvasSource, /title=\{t\('agentQueueTooltip', lang\)\}/)
  assert.match(canvasSource, /title=\{t\('lineageLinesTooltip', lang\)\}/)
  assert.doesNotMatch(canvasSource, />[^<{]*\p{Script=Han}[^<{]*</u)
})

test('relay UI exposes only Base URL, API Key, connect and delete controls', () => {
  assert.match(source, />Base URL\s*</)
  assert.match(source, />API Key\s*</)
  assert.match(source, /连接并拉取模型/)
  assert.match(source, /删除/)

  for (const forbidden of [
    'Configuration mode',
    'OpenAI-compatible',
    'Custom (advanced)',
    'Auth type',
    'Capabilities',
    'Advanced endpoints',
    'Models path',
    'Path prefix',
    'JSON template',
    'Refresh models',
    'Validate',
  ]) assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `must not expose ${forbidden}`)
})

test('API keys use one localized provider list with region and validation evidence', () => {
  assert.doesNotMatch(apiKeysSource, /CHINA_IDS|China Providers|Global Providers/)
  assert.match(apiKeysSource, /configured\.has\(right\)/)
  assert.match(apiKeysSource, /localeCompare/)
  assert.match(apiKeysSource, /regionLabel\(info\.region, lang\)/)
  assert.match(apiKeysSource, /validationEvidenceLabel\(trackValidation, lang\)/)
  assert.match(apiKeysSource, /validationAvailability\(providerLists, providerId, track\)/)
  assert.match(apiKeysSource, /disabled=\{cardBusy \|\| unsupported\}/)
  assert.match(apiKeysSource, /不支持无成本验证/)
  assert.match(apiKeysSource, /trackValidation\.errorCode/)
  assert.match(apiKeysSource, /trackValidation\.message/)
  for (const key of ['regionGlobal', 'regionChina', 'regionBoth', 'regionUnknown']) assert.match(i18nSource, new RegExp(`${key}:`))
  for (const phrase of ['输出已验证', '请求已验证，未验证文本输出', '仅目录已验证']) assert.match(i18nSource, new RegExp(phrase))
  for (const evidence of ['assistant_output', 'protocol_response', 'model_directory']) assert.match(sharedSource, new RegExp(evidence))
})

test('provider links have localized user-facing labels', () => {
  for (const key of ['linkDocs', 'linkGetKey', 'linkPricing']) {
    assert.equal((i18nSource.match(new RegExp(`${key}:`, 'g')) || []).length, 2)
  }
  for (const phrase of ['文档', '获取密钥', '价格', 'Docs', 'Get API Key', 'Pricing']) assert.match(i18nSource, new RegExp(phrase))
})

test('relay save submits only renderer-owned intent fields', () => {
  assert.match(source, /connection:\s*\{\s*id:\s*relay\.id,\s*baseUrl:\s*relay\.baseUrl\.trim\(\),\s*apiKey:\s*credential\s*\}/)
  assert.doesNotMatch(source, /connection:\s*\{\s*\.\.\./)
  assert.doesNotMatch(source, /providerModels\?\.refresh|providerValidation\?\.run/)
})

test('failed relay detection stays local and never refreshes canonical state', () => {
  const saveBody = source.slice(source.indexOf('const save = async relay =>'), source.indexOf('const remove = async relay =>'))
  assert.match(saveBody, /const outcome = result\?\.detectionResult \|\| result\?\.modelsResult/)
  assert.match(saveBody, /if \(outcome\?\.ok !== true\)[\s\S]*?patch\(relay\.id,[\s\S]*?cardError:[\s\S]*?diagnostic:[\s\S]*?return[\s\S]*?await refresh\(\)/)
  assert.doesNotMatch(saveBody, /setError\(/, 'connection failures must not become page-level errors')
  assert.match(saveBody, /patch\(relay\.id, \{ apiKey: ''/)
})

test('relay failure diagnostics are redacted and copyable per card', () => {
  assert.match(source, /function redactDiagnosticText/)
  assert.match(source, /split\(secret\)\.join\('\[REDACTED\]'\)/)
  assert.match(source, /relayFailureDiagnostic\(failure, relay, credential\)/)
  assert.match(source, /navigator\.clipboard\.writeText\(relay\.diagnostic\)/)
  assert.match(source, /function relayFailureMessage/)
  for (const field of ['protocol', 'stage', 'statusCode', 'endpointPath']) assert.match(source, new RegExp(`${field}:`))
  assert.match(source, /复制脱敏诊断/)
})

test('legacy relay normalization copies public summary metadata explicitly', () => {
  assert.match(source, /detectedProtocol:/)
  assert.match(source, /detectedAt:/)
  assert.match(source, /detectedEndpoints:/)
  assert.match(source, /modelsCount:/)
  assert.doesNotMatch(source, /return\s*\{\s*\.\.\.EMPTY\(\),\s*\.\.\.item/)
  for (const privateOrAdvancedField of ['compatibilityMode', 'authType', 'capabilities', 'modelsPath', 'pathPrefix', 'sessionToken', 'templateErrors']) {
    assert.doesNotMatch(source, new RegExp(privateOrAdvancedField), `renderer must not retain ${privateOrAdvancedField}`)
  }
})
