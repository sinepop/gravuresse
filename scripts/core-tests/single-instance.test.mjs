import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { acquireSingleInstanceLock } = require('../../electron/single-instance.js')

test('a secondary process quits before registering a focus handler', () => {
  const events = new Map()
  let quitCalls = 0
  const app = {
    requestSingleInstanceLock: () => false,
    quit: () => { quitCalls += 1 },
    on: (name, handler) => events.set(name, handler)
  }

  assert.equal(acquireSingleInstanceLock(app, () => null), false)
  assert.equal(quitCalls, 1)
  assert.equal(events.has('second-instance'), false)
})

test('the primary process restores, shows, and focuses its existing window', () => {
  const events = new Map()
  const calls = []
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus')
  }
  const app = {
    requestSingleInstanceLock: () => true,
    quit: () => calls.push('quit'),
    on: (name, handler) => events.set(name, handler)
  }

  assert.equal(acquireSingleInstanceLock(app, () => window), true)
  assert.equal(typeof events.get('second-instance'), 'function')
  events.get('second-instance')()
  assert.deepEqual(calls, ['restore', 'show', 'focus'])
})

test('main acquires the single-instance lock before scheduling app readiness', () => {
  const testDir = fileURLToPath(new URL('.', import.meta.url))
  const mainSource = fs.readFileSync(new URL('../../electron/main.js', import.meta.url), 'utf8')
  const lockIndex = mainSource.indexOf('acquireSingleInstanceLock(app')
  const readyIndex = mainSource.indexOf('app.whenReady()')

  assert.ok(lockIndex >= 0, `single-instance acquisition is missing (checked from ${testDir})`)
  assert.ok(readyIndex > lockIndex, 'single-instance acquisition must happen before app.whenReady()')
  assert.match(mainSource, /if\s*\(singleInstanceLockAcquired\)\s*\{\s*app\.whenReady\(\)/)
})
