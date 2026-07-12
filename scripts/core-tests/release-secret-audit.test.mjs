import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const AUDIT_SCRIPT = resolve(HERE, '..', 'audit-release-secrets.mjs')
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}: ${result.stderr}`)
  }
}

function createRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'gravuresse-secret-audit-'))
  run('git', ['init', '--quiet'], cwd)
  run('git', ['config', 'user.name', 'Audit Test'], cwd)
  run('git', ['config', 'user.email', 'audit@example.invalid'], cwd)
  return cwd
}

function writeTracked(cwd, rel, content, { force = false } = {}) {
  const path = join(cwd, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  run('git', ['add', ...(force ? ['--force'] : []), '--', rel], cwd)
}

function audit(cwd) {
  return spawnSync(process.execPath, [AUDIT_SCRIPT], { cwd, encoding: 'utf8' })
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 4, 'ascii')
  data.copy(chunk, 8)
  return chunk
}

test('release audit accepts a safe tracked tree', () => {
  const cwd = createRepo()
  try {
    writeTracked(cwd, 'safe.txt', 'safe fixture\n')
    const result = audit(cwd)
    assert.equal(result.status, 0, result.stderr)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release audit checks force-tracked agent files before reading content', () => {
  const cwd = createRepo()
  try {
    writeTracked(cwd, '.gitignore', '.codex/\n')
    const marker = 'content-must-remain-private'
    writeTracked(cwd, '.codex/agents/config.toml', marker, { force: true })
    const result = audit(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /forbidden-file \.codex\/agents\/config\.toml/)
    assert.doesNotMatch(output, new RegExp(marker))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release audit does not let test context suppress a token-shaped value', () => {
  const cwd = createRepo()
  try {
    const token = ['gl', 'pat-', 'A'.repeat(24)].join('')
    writeTracked(cwd, 'fixture.txt', `test fixture ${token}\n`)
    const result = audit(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /gitlab-token fixture\.txt:1/)
    assert.doesNotMatch(output, new RegExp(token))
    assert.doesNotMatch(output, /glpat-/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release audit reports an email location without printing the address', () => {
  const cwd = createRepo()
  try {
    const address = ['owner', '@', 'privacy.local'].join('')
    writeTracked(cwd, 'README.md', `Contact: ${address}\n`)
    const result = audit(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /email-address README\.md:1/)
    assert.doesNotMatch(output, new RegExp(address.replace('.', '\\.')))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release audit rejects PNG provenance metadata without reading its payload', () => {
  const cwd = createRepo()
  try {
    const marker = 'metadata-must-remain-private'
    const png = Buffer.concat([
      PNG_SIGNATURE,
      pngChunk('caBX', Buffer.from(marker)),
      pngChunk('IEND')
    ])
    writeTracked(cwd, 'icon.png', png)
    const result = audit(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /png-provenance-metadata icon\.png/)
    assert.doesNotMatch(output, new RegExp(marker))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
