import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { inlineProviderMediaPayload, pollSessionPayload } = require('../../electron/provider-media.js')

test('local cache URLs are resolved before a provider receives them', () => {
  const input = {
    prompt: 'test',
    sourceImageUrl: 'gravuresse-media://cache/a.png',
    source_image_url: 'https://cdn.example.com/unchanged.png'
  }
  const calls = []
  const output = inlineProviderMediaPayload(input, (url, type) => {
    calls.push({ url, type })
    return 'data:image/png;base64,iVBORw0KGgo='
  })

  assert.notEqual(output, input)
  assert.equal(input.sourceImageUrl, 'gravuresse-media://cache/a.png', 'input is not mutated')
  assert.equal(output.sourceImageUrl, 'data:image/png;base64,iVBORw0KGgo=')
  assert.equal(output.source_image_url, input.source_image_url)
  assert.deepEqual(calls, [{ url: input.sourceImageUrl, type: 'image' }])
})

test('ordinary HTTPS and data URLs pass through without allocation', () => {
  const input = {
    sourceImageUrl: 'https://cdn.example.com/source.png',
    source_image_url: 'data:image/png;base64,iVBORw0KGgo='
  }
  assert.equal(inlineProviderMediaPayload(input, () => assert.fail('resolver must not run')), input)
})

test('poll sessions never retain large source media payloads', () => {
  const output = pollSessionPayload({
    action: 'submit',
    taskId: 'task-1',
    sourceImageUrl: 'data:image/png;base64,large',
    source_image_url: 'gravuresse-media://cache/a.png'
  })
  assert.deepEqual(output, { action: 'submit', taskId: 'task-1' })
})
