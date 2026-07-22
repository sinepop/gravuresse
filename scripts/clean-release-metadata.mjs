import { existsSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const RELEASE_DIR = resolve(ROOT, 'release')
const DIST_DIR = resolve(ROOT, 'dist')
const version = process.env.npm_package_version || '2.4.0'
const prepare = process.argv.includes('--prepare')

function assertProjectChild(target, expectedName) {
  if (dirname(target) !== ROOT || basename(target) !== expectedName) {
    throw new Error(`Refusing to clean unsafe path: ${target}`)
  }
}

assertProjectChild(DIST_DIR, 'dist')
assertProjectChild(RELEASE_DIR, 'release')

if (prepare) {
  for (const target of [DIST_DIR, RELEASE_DIR]) {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  }
  console.log('Safely removed project dist and release directories')
} else if (existsSync(RELEASE_DIR)) {
  const allowed = new Set([
    `gravuresse-Setup-${version}.exe`,
    `gravuresse-Setup-${version}.exe.blockmap`,
    'latest.yml',
    'SHA256SUMS.txt',
    'win-unpacked'
  ])
  for (const entry of readdirSync(RELEASE_DIR, { withFileTypes: true })) {
    if (allowed.has(entry.name)) continue
    rmSync(join(RELEASE_DIR, entry.name), { recursive: entry.isDirectory(), force: true })
    console.log(`Removed stale release artifact: release/${entry.name}`)
  }
  console.log('Release directory finalized to the 2.4.0 artifact allowlist')
}
