import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { classifyModel } = require('../../shared/modelCapabilities.cjs')
const openAi = require('../../electron/providers/handlers/openai.js')._test
const custom = require('../../electron/providers/handlers/custom.js')._test

test('media model names are hints, not capability evidence', () => {
  assert.equal(classifyModel({ id: 'sora-2' }).capability, 'unknown')
  assert.equal(classifyModel({ id: 'flux-pro' }).capability, 'unknown')
  assert.equal(classifyModel({ id: 'gpt-image-2' }).capability, 'unknown')
  assert.equal(classifyModel({ id: 'sora-2', output_modalities: ['video'] }).capability, 'video')
  assert.equal(classifyModel({ id: 'flux-pro', capabilities: { textToImage: true } }).capability, 'image')
  assert.equal(classifyModel({ id: 'vision-input', modalities: { input: ['image'], output: ['text'] } }).capability, 'unknown')
})

test('OpenAI chat uses the stored validated relative endpoint', () => {
  assert.equal(
    openAi.chatCompletionsUrl('https://relay.example.com/api', '/custom/chat').href,
    'https://relay.example.com/api/custom/chat'
  )
  assert.equal(
    openAi.chatCompletionsUrl('https://relay.example.com/v1').href,
    'https://relay.example.com/v1/chat/completions'
  )
})

test('relay UI template fields map to executor fields without overriding legacy fields', () => {
  const mapped = custom.getTemplate({
    action: 'generate',
    template: {
      request: { prompt: '{prompt}' },
      body: {},
      resultPath: 'data.output.url',
      pollEndpoint: '/tasks/{taskId}'
    }
  })
  assert.deepEqual(mapped.requestBody, { prompt: '{prompt}' })
  assert.equal(mapped.responsePath, 'data.output.url')
  assert.equal(mapped.imageUrlPath, 'data.output.url')
  assert.equal(mapped.pollPath, '/tasks/{taskId}')
  assert.deepEqual(custom.customImageBodyTemplate(mapped), { prompt: '{prompt}' })
  assert.equal(
    custom.extractImage({ data: { output: { url: 'https://cdn.example.com/result.png' } } }, mapped),
    'https://cdn.example.com/result.png'
  )

  const bodyOnly = custom.normalizeTemplateContract({ request: {}, body: { prompt: '{prompt}' } }, 'generate')
  assert.equal(bodyOnly.requestBody, undefined)

  const legacy = custom.normalizeTemplateContract({
    request: { ignored: true },
    requestBody: { prompt: '{prompt}' },
    resultPath: 'new.path',
    imageUrlPath: 'legacy.path',
    pollEndpoint: '/new/{taskId}',
    pollPath: '/legacy/{taskId}'
  }, 'generate')
  assert.deepEqual(legacy.requestBody, { prompt: '{prompt}' })
  assert.equal(legacy.imageUrlPath, 'legacy.path')
  assert.equal(legacy.pollPath, '/legacy/{taskId}')

  const video = custom.normalizeTemplateContract({ resultPath: 'output.video', pollEndpoint: '/jobs/{taskId}' }, 'poll')
  assert.equal(video.videoUrlPath, 'output.video')
  assert.equal(video.pollPath, '/jobs/{taskId}')
})
