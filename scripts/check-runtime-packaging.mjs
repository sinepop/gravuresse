import { access, readFile, readdir, stat } from 'node:fs/promises'
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
  const mainEntry = path.join(rootDir, 'dist', 'main', 'main.js')
  const preloadEntry = path.join(rootDir, 'dist', 'preload', 'preload.js')
  const sharedDir = path.join(rootDir, 'dist', 'shared')
  const sharedFile = path.join(sharedDir, 'modelCapabilities.cjs')

  await assertFile(mainEntry, 'dist/main/main.js')
  await assertFile(preloadEntry, 'dist/preload/preload.js')
  await assertDirectory(sharedDir, 'dist/shared')
  await assertFile(sharedFile, 'dist/shared/modelCapabilities.cjs')
  const compiledModels = path.join(rootDir, 'dist', 'main', 'api', 'models.js')
  await assertFile(compiledModels, 'compiled dist/main/api/models.js')
  await assertCompiledRequireGraph(path.join(rootDir, 'dist', 'main'))
  try {
    requireFromRoot('./dist/main/api/models.js')
  } catch (error) {
    console.error(`Runtime check failed: compiled dist/main/api/models.js did not load.`)
    console.error(error?.message || error)
    process.exit(1)
  }

  console.log('Runtime check passed: compiled main module graph, preload entry, and shared runtime asset exist.')
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

async function assertCompiledRequireGraph(directory) {
  const files = await listJavaScriptFiles(directory)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const requirePattern = /require\(["'](\.{1,2}\/[^"']+)["']\)/g
    for (const match of source.matchAll(requirePattern)) {
      const target = path.resolve(path.dirname(file), match[1])
      const candidates = path.extname(target)
        ? [target]
        : [`${target}.js`, `${target}.cjs`, path.join(target, 'index.js')]
      if (!(await firstExistingFile(candidates))) {
        console.error(`Runtime check failed: ${path.relative(rootDir, file)} requires missing ${match[1]}`)
        process.exit(1)
      }
    }
  }
}

async function listJavaScriptFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listJavaScriptFiles(entryPath))
    else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(entryPath)
  }
  return files
}

async function firstExistingFile(candidates) {
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate)
      if (info.isFile()) return candidate
    } catch {}
  }
  return null
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
