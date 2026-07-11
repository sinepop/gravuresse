import { access, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const rootDir = process.cwd()
const args = new Set(process.argv.slice(2))
const validArgs = new Set(['--dist', '--asar'])
const unknownArgs = [...args].filter(arg => !validArgs.has(arg))

if (unknownArgs.length) {
  console.error(`Unknown arguments: ${unknownArgs.join(', ')}`)
  console.error('Usage: node scripts/check-runtime-packaging.mjs [--dist] [--asar]')
  process.exit(1)
}

const checkDist = args.size === 0 || args.has('--dist')
const checkAsar = args.size === 0 || args.has('--asar')

if (checkDist) await checkDistRuntime()
if (checkAsar) await checkPackagedAsar()

function requireFromRoot(modulePath) {
  const require = createRequire(path.join(rootDir, 'runtime-check.cjs'))
  return require(modulePath)
}

async function checkDistRuntime() {
  const sharedDir = path.join(rootDir, 'dist', 'shared')
  const sharedFile = path.join(sharedDir, 'modelCapabilities.cjs')

  await assertDirectory(sharedDir, 'dist/shared')
  await assertFile(sharedFile, 'dist/shared/modelCapabilities.cjs')

  try {
    requireFromRoot('./dist/main/api/models.js')
  } catch (error) {
    console.error(`Runtime check failed: require('./dist/main/api/models.js') did not load.`)
    console.error(error?.message || error)
    process.exit(1)
  }

  console.log('Runtime check passed: dist/shared exists and dist/main/api/models.js loads.')
}

async function checkPackagedAsar() {
  const appAsar = path.join(rootDir, 'release', 'win-unpacked', 'resources', 'app.asar')
  const requiredEntries = [
    'package.json',
    'dist/main/main.js',
    'dist/preload/preload.js',
    'dist/renderer/index.html',
    'dist/shared/modelCapabilities.cjs'
  ]

  await assertFile(appAsar, 'release/win-unpacked/resources/app.asar')

  const { listPackage } = requireFromRoot('@electron/asar')
  const files = listPackage(appAsar) || []
  const normalizedFiles = new Set(files.map(file => String(file).replace(/\\/g, '/').replace(/^\/+/, '')))
  const missing = requiredEntries.filter(entry => !normalizedFiles.has(entry))
  if (missing.length) {
    console.error(`ASAR check failed: missing ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(`ASAR check passed: ${requiredEntries.length} required runtime entries are packaged.`)
}

async function assertDirectory(filePath, label) {
  let info
  try {
    info = await stat(filePath)
  } catch {
    console.error(`Runtime check failed: missing ${label}`)
    process.exit(1)
  }
  if (!info.isDirectory()) {
    console.error(`Runtime check failed: ${label} is not a directory`)
    process.exit(1)
  }
}

async function assertFile(filePath, label) {
  try {
    await access(filePath)
  } catch {
    console.error(`Runtime check failed: missing ${label}`)
    process.exit(1)
  }
}
