import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { blake2b } from '@noble/hashes/blake2.js'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const VERIFY_SCRIPT = resolve(HERE, '..', 'verify-release-artifacts.mjs')
const CHECKSUM_SCRIPT = resolve(HERE, '..', 'release-checksums.mjs')
const VERSION = '9.8.7'
const INSTALLER_NAME = `gravuresse-Setup-${VERSION}.exe`
const BLOCKMAP_NAME = `${INSTALLER_NAME}.blockmap`

function digest(algorithm, bytes, encoding) {
  return createHash(algorithm).update(bytes).digest(encoding)
}

function blockmapFor(bytes) {
  const checksum = Buffer.from(blake2b(bytes, { dkLen: 18 })).toString('base64')
  return gzipSync(Buffer.from(JSON.stringify({
    version: '2',
    files: [{
      name: 'file',
      offset: 0,
      checksums: [checksum],
      sizes: [bytes.length]
    }]
  })), { level: 9 })
}

function latestYaml(installerBytes, { size = installerBytes.length, sha512 = digest('sha512', installerBytes, 'base64') } = {}) {
  return [
    `version: ${VERSION}`,
    'files:',
    `  - url: ${INSTALLER_NAME}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${INSTALLER_NAME}`,
    `sha512: ${sha512}`,
    "releaseDate: '2026-07-30T00:00:00.000Z'",
    ''
  ].join('\n')
}

function writeFixture({
  installerBytes = Buffer.from('fixture installer bytes'),
  blockmapBytes = blockmapFor(installerBytes),
  latest = latestYaml(installerBytes),
  checksumOverride = {}
} = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'gravuresse-release-integrity-'))
  const releaseDir = join(cwd, 'release')
  mkdirSync(releaseDir, { recursive: true })
  writeFileSync(join(cwd, 'package.json'), `${JSON.stringify({ name: 'fixture', version: VERSION }, null, 2)}\n`)

  const files = new Map([
    [INSTALLER_NAME, installerBytes],
    [BLOCKMAP_NAME, blockmapBytes],
    ['latest.yml', Buffer.from(latest)]
  ])
  for (const [name, bytes] of files) writeFileSync(join(releaseDir, name), bytes)

  const checksumLines = [...files].map(([name, bytes]) => {
    const hash = checksumOverride[name] || digest('sha256', bytes, 'hex')
    return `${hash}  ${name}`
  })
  writeFileSync(join(releaseDir, 'SHA256SUMS.txt'), `${checksumLines.sort().join('\n')}\n`)
  return cwd
}

function verify(cwd) {
  return spawnSync(process.execPath, [VERIFY_SCRIPT], { cwd, encoding: 'utf8' })
}

test('release verifier accepts one cryptographically consistent artifact set', () => {
  const cwd = writeFixture()
  try {
    const result = verify(cwd)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Release artifact integrity verified/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release checksum generator produces a manifest accepted by the verifier', () => {
  const cwd = writeFixture()
  try {
    writeFileSync(join(cwd, 'release', 'SHA256SUMS.txt'), 'stale manifest\n')
    const checksumResult = spawnSync(process.execPath, [CHECKSUM_SCRIPT], { cwd, encoding: 'utf8' })
    assert.equal(checksumResult.status, 0, checksumResult.stderr)

    const verifyResult = verify(cwd)
    assert.equal(verifyResult.status, 0, verifyResult.stderr)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release verifier rejects latest.yml size and sha512 from another installer', () => {
  const installerBytes = Buffer.from('public installer bytes')
  const cwd = writeFixture({
    installerBytes,
    latest: latestYaml(installerBytes, {
      size: installerBytes.length + 1,
      sha512: digest('sha512', Buffer.from('different installer bytes'), 'base64')
    })
  })
  try {
    const result = verify(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /latest\.yml files\[0\]\.size/)
    assert.match(output, /latest\.yml files\[0\]\.sha512/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release verifier rejects a stale SHA256SUMS installer entry', () => {
  const cwd = writeFixture({ checksumOverride: { [INSTALLER_NAME]: '0'.repeat(64) } })
  try {
    const result = verify(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, new RegExp(`SHA256SUMS\\.txt hash mismatch for ${INSTALLER_NAME.replaceAll('.', '\\.')}`))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('release verifier rejects a same-size blockmap generated for different installer bytes', () => {
  const installerBytes = Buffer.alloc(128, 0x41)
  const staleInstallerBytes = Buffer.alloc(installerBytes.length, 0x42)
  const cwd = writeFixture({
    installerBytes,
    blockmapBytes: blockmapFor(staleInstallerBytes)
  })
  try {
    const result = verify(cwd)
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /blockmap checksum mismatch at chunk 0/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('full package verifies artifacts after checksums and before every smoke test', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts['release:verify'], 'node scripts/verify-release-artifacts.mjs')
  const commands = packageJson.scripts.package.split(' && ')
  const checksumIndex = commands.indexOf('npm run release:checksums')
  const verifyIndex = commands.indexOf('npm run release:verify')
  const packagedSmokeIndex = commands.indexOf('npm run smoke:packaged')
  const installerSmokeIndex = commands.indexOf('npm run smoke:installer')
  assert.ok(checksumIndex >= 0, 'package must generate SHA256SUMS')
  assert.ok(verifyIndex > checksumIndex, 'package must verify the generated checksum set')
  assert.ok(packagedSmokeIndex > verifyIndex, 'artifact verification must fail before packaged smoke')
  assert.ok(installerSmokeIndex > verifyIndex, 'artifact verification must fail before installer smoke')
})
