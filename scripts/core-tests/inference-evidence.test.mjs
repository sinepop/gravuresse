import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  MINIMAL_INFERENCE_PROMPT,
  MINIMAL_INFERENCE_TOKENS,
  analyzeInferenceResponse,
  assertSuccessfulResponse,
  buildMinimalInferenceBody,
  extractPrimaryInferenceOutput
} = require('../../electron/providers/inference-evidence.js')

test('minimal inference requests use a deterministic prompt and 16 output tokens', () => {
  assert.equal(MINIMAL_INFERENCE_PROMPT, 'Reply only with OK')
  assert.equal(MINIMAL_INFERENCE_TOKENS, 16)
  assert.deepEqual(buildMinimalInferenceBody('openai', 'deepseek-reasoner'), {
    model: 'deepseek-reasoner', messages: [{ role: 'user', content: 'Reply only with OK' }], max_tokens: 16
  })
  assert.equal(buildMinimalInferenceBody('anthropic', 'claude').max_tokens, 16)
  assert.equal(buildMinimalInferenceBody('gemini', 'gemini-pro').generationConfig.maxOutputTokens, 16)
})

test('OpenAI evidence supports strings, content arrays, and DeepSeek reasoning', () => {
  assert.deepEqual(analyzeInferenceResponse('openai', { choices: [{ message: { content: 'OK' } }] }), {
    evidence: 'assistant_output', outputVerified: true, text: 'OK', thinking: ''
  })
  assert.equal(analyzeInferenceResponse('openai', {
    choices: [{ message: { content: [{ type: 'text', text: 'O' }, { type: 'text', text: 'K' }] } }]
  }).text, 'OK')
  const deepseek = analyzeInferenceResponse('openai', {
    choices: [{ message: { content: '', reasoning_content: 'verified reasoning' }, finish_reason: 'length' }],
    usage: { completion_tokens: 16 }
  })
  assert.equal(deepseek.evidence, 'assistant_output')
  assert.equal(deepseek.thinking, 'verified reasoning')
})

test('valid empty OpenAI envelopes prove a protocol response without claiming output', () => {
  assert.deepEqual(analyzeInferenceResponse('openai', {
    choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
    usage: { completion_tokens: 16 }
  }), { evidence: 'protocol_response', outputVerified: false, text: '', thinking: '' })
})

test('Anthropic and Gemini distinguish assistant output from valid empty envelopes', () => {
  assert.equal(analyzeInferenceResponse('anthropic', {
    content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', usage: { output_tokens: 1 }
  }).evidence, 'assistant_output')
  assert.equal(analyzeInferenceResponse('anthropic', {
    content: [], stop_reason: 'max_tokens', usage: { output_tokens: 16 }
  }).evidence, 'protocol_response')
  assert.equal(analyzeInferenceResponse('gemini', {
    candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }]
  }).evidence, 'assistant_output')
  assert.equal(analyzeInferenceResponse('google', {
    candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { candidatesTokenCount: 16 }
  }).evidence, 'protocol_response')
})

test('arbitrary, malformed, and error responses never produce evidence', () => {
  for (const value of ['', '{bad json', '{}', JSON.stringify({ error: { message: 'denied' } })]) {
    assert.throws(() => analyzeInferenceResponse('openai', value), /invalid JSON|error response|valid protocol response/)
  }
  assert.throws(() => analyzeInferenceResponse('anthropic', { content: [] }), /valid protocol response/)
  assert.throws(() => analyzeInferenceResponse('gemini', { candidates: [] }), /valid protocol response/)
  assert.throws(() => analyzeInferenceResponse('openai', { choices: [{ message: {}, finish_reason: 'error' }], usage: { total_tokens: 0 } }), /valid protocol response/)
  assert.throws(() => analyzeInferenceResponse('anthropic', { content: [], stop_reason: 'error', usage: { output_tokens: 0 } }), /valid protocol response/)
  assert.throws(() => analyzeInferenceResponse('gemini', { candidates: [{ content: { parts: [] }, finishReason: 'ERROR' }], usageMetadata: { totalTokenCount: 0 } }), /valid protocol response/)
})

test('runtime extraction returns only the primary candidate and preserves thinking', () => {
  assert.deepEqual(extractPrimaryInferenceOutput('openai', {
    choices: [
      { message: { content: 'first', reasoning_content: 'thought' } },
      { message: { content: 'second' } }
    ]
  }), { text: 'first', thinking: 'thought' })
  assert.deepEqual(extractPrimaryInferenceOutput('anthropic', {
    content: [{ type: 'thinking', thinking: 'reasoning' }, { type: 'text', text: 'answer' }]
  }), { text: 'answer', thinking: 'reasoning' })
})

test('validation transport accepts only 2xx responses', () => {
  assert.doesNotThrow(() => assertSuccessfulResponse({ status: 200 }))
  assert.doesNotThrow(() => assertSuccessfulResponse({}))
  for (const status of [199, 300, 304, 401, 500]) {
    assert.throws(() => assertSuccessfulResponse({ status }), error => error?.status === status)
  }
})
