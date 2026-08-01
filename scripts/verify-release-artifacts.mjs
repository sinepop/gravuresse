import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { blake2b } from '@noble/hashes/blake2.js'

const ROOT = process.cwd()
const RELEASE_DIR = path.join(ROOT, 'release')
const BLOCKMAP_MAX_CHUNK_BYTES = 32 * 1024

function addFailure(failures, message) {
  if (!failures.includes(message)) failures.push(message)
}

function parseYamlScalar(raw) {
  const value = String(raw ?? '').trim()
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'")
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function setUnique(target, key, value, label, failures) {
  if (Object.hasOwn(target, key)) {
    addFailure(failures, `latest.yml contains duplicate ${label}`)
    return
  }
  target[key] = value
}

function parseLatestYaml(text, failures) {
  const document = { files: [] }
  let inFiles = false
  let currentFile = null

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue

    if (!/^\s/.test(rawLine)) {
      currentFile = null
      const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(rawLine)
      if (!match) {
        addFailure(failures, `latest.yml has an unsupported top-level line: ${rawLine.trim()}`)
        inFiles = false
        continue
      }
      const [, key, rawValue = ''] = match
      inFiles = key === 'files'
      if (inFiles) {
        if (rawValue.trim()) addFailure(failures, 'latest.yml files must be a list')
      } else {
        setUnique(document, key, parseYamlScalar(rawValue), key, failures)
      }
      continue
    }

    if (!inFiles) {
      addFailure(failures, `latest.yml has an unexpected indented line: ${rawLine.trim()}`)
      continue
    }

    const itemMatch = /^\s+-\s+url:\s*(.+?)\s*$/.exec(rawLine)
    if (itemMatch) {
      currentFile = { url: parseYamlScalar(itemMatch[1]) }
      document.files.push(currentFile)
      continue
    }

    const propertyMatch = /^\s+(sha512|size):\s*(.+?)\s*$/.exec(rawLine)
    if (!propertyMatch || !currentFile) {
      addFailure(failures, `latest.yml has an unsupported files entry: ${rawLine.trim()}`)
      continue
    }
    const [, key, rawValue] = propertyMatch
    const value = key === 'size' ? Number(parseYamlScalar(rawValue)) : parseYamlScalar(rawValue)
    setUnique(currentFile, key, value, `files entry ${key}`, failures)
  }

  return document
}

function validateLatest(document, expected, failures) {
  if (document.version !== expected.version) {
    addFailure(failures, `latest.yml version ${String(document.version)} does not match package version ${expected.version}`)
  }
  if (document.files.length !== 1) {
    addFailure(failures, `latest.yml must describe exactly one installer, found ${document.files.length}`)
  }

  const file = document.files[0] || {}
  if (file.url !== expected.installerName) {
    addFailure(failures, `latest.yml files[0].url must be ${expected.installerName}`)
  }
  if (!Number.isSafeInteger(file.size) || file.size !== expected.installerSize) {
    addFailure(failures, `latest.yml files[0].size ${String(file.size)} does not match installer size ${expected.installerSize}`)
  }
  if (file.sha512 !== expected.installerSha512) {
    addFailure(failures, 'latest.yml files[0].sha512 does not match the public installer')
  }
  if (document.path !== expected.installerName) {
    addFailure(failures, `latest.yml path must be ${expected.installerName}`)
  }
  if (document.sha512 !== expected.installerSha512) {
    addFailure(failures, 'latest.yml top-level sha512 does not match the public installer')
  }
}

function parseChecksumManifest(text, failures) {
  const checksums = new Map()
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    const match = /^([0-9a-fA-F]{64})  ([^/\\]+)$/.exec(rawLine)
    if (!match) {
      addFailure(failures, `SHA256SUMS.txt has an invalid entry: ${rawLine}`)
      continue
    }
    const [, hash, name] = match
    if (checksums.has(name)) {
      addFailure(failures, `SHA256SUMS.txt contains duplicate entry for ${name}`)
      continue
    }
    checksums.set(name, hash.toLowerCase())
  }
  return checksums
}

async function hashFile(file, algorithm, encoding) {
  const hash = createHash(algorithm)
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest(encoding)
}

async function validateChecksums(checksums, artifactPaths, failures) {
  const expectedNames = new Set(artifactPaths.keys())
  for (const name of checksums.keys()) {
    if (!expectedNames.has(name)) addFailure(failures, `SHA256SUMS.txt contains unexpected artifact ${name}`)
  }

  for (const [name, file] of artifactPaths) {
    if (!checksums.has(name)) {
      addFailure(failures, `SHA256SUMS.txt is missing ${name}`)
      continue
    }
    const actual = await hashFile(file, 'sha256', 'hex')
    if (checksums.get(name) !== actual) {
      addFailure(failures, `SHA256SUMS.txt hash mismatch for ${name}`)
    }
  }
}

function parseBlockmap(bytes, failures) {
  let blockmap
  try {
    blockmap = JSON.parse(gunzipSync(bytes).toString('utf8'))
  } catch (error) {
    addFailure(failures, `blockmap is not valid gzip JSON: ${error.message}`)
    return null
  }

  if (blockmap?.version !== '2') addFailure(failures, `blockmap version must be 2, found ${String(blockmap?.version)}`)
  if (!Array.isArray(blockmap?.files) || blockmap.files.length !== 1) {
    addFailure(failures, 'blockmap must describe exactly one file')
    return null
  }

  const file = blockmap.files[0]
  if (file?.name !== 'file') addFailure(failures, 'blockmap file name must be file')
  if (file?.offset !== 0) addFailure(failures, 'blockmap file offset must be zero')
  if (!Array.isArray(file?.checksums) || !Array.isArray(file?.sizes)) {
    addFailure(failures, 'blockmap checksums and sizes must be arrays')
    return null
  }
  if (file.checksums.length === 0 || file.checksums.length !== file.sizes.length) {
    addFailure(failures, 'blockmap checksums and sizes must be non-empty and have equal length')
    return null
  }

  for (let index = 0; index < file.sizes.length; index += 1) {
    const size = file.sizes[index]
    if (!Number.isSafeInteger(size) || size <= 0 || size > BLOCKMAP_MAX_CHUNK_BYTES) {
      addFailure(failures, `blockmap has invalid size at chunk ${index}`)
    }
    const checksum = file.checksums[index]
    const decoded = typeof checksum === 'string' ? Buffer.from(checksum, 'base64') : Buffer.alloc(0)
    if (decoded.length !== 18 || decoded.toString('base64') !== checksum) {
      addFailure(failures, `blockmap has invalid checksum at chunk ${index}`)
    }
  }
  return file
}

async function validateBlockmap(installerPath, installerSize, blockmapPath, failures) {
  const blockmapFile = parseBlockmap(await readFile(blockmapPath), failures)
  if (!blockmapFile) return

  const structureValid = blockmapFile.sizes.every(size => (
    Number.isSafeInteger(size) && size > 0 && size <= BLOCKMAP_MAX_CHUNK_BYTES
  )) && blockmapFile.checksums.every(checksum => {
    if (typeof checksum !== 'string') return false
    const decoded = Buffer.from(checksum, 'base64')
    return decoded.length === 18 && decoded.toString('base64') === checksum
  })
  if (!structureValid) return

  const mappedSize = blockmapFile.sizes.reduce((sum, size) => sum + size, 0)
  if (!Number.isSafeInteger(mappedSize) || mappedSize !== installerSize) {
    addFailure(failures, `blockmap mapped size ${mappedSize} does not match installer size ${installerSize}`)
    return
  }

  const installer = await open(installerPath, 'r')
  try {
    let position = 0
    for (let index = 0; index < blockmapFile.sizes.length; index += 1) {
      const size = blockmapFile.sizes[index]
      const chunk = Buffer.allocUnsafe(size)
      let offset = 0
      while (offset < size) {
        const { bytesRead } = await installer.read(chunk, offset, size - offset, position + offset)
        if (bytesRead === 0) {
          addFailure(failures, `blockmap chunk ${index} extends beyond installer bytes`)
          return
        }
        offset += bytesRead
      }
      const actual = Buffer.from(blake2b(chunk, { dkLen: 18 })).toString('base64')
      if (actual !== blockmapFile.checksums[index]) {
        addFailure(failures, `blockmap checksum mismatch at chunk ${index}`)
        return
      }
      position += size
    }
  } finally {
    await installer.close()
  }
}

async function fileStats(requiredPaths, failures) {
  const stats = new Map()
  for (const [name, file] of requiredPaths) {
    try {
      const value = await stat(file)
      if (!value.isFile()) addFailure(failures, `release artifact is not a file: ${name}`)
      else stats.set(name, value)
    } catch (error) {
      if (error?.code === 'ENOENT') addFailure(failures, `missing release artifact: ${name}`)
      else throw error
    }
  }
  return stats
}

async function main() {
  const failures = []
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const version = packageJson.version
  if (typeof version !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(version)) {
    throw new Error(`package.json has an unsafe release version: ${String(version)}`)
  }

  const installerName = `gravuresse-Setup-${version}.exe`
  const blockmapName = `${installerName}.blockmap`
  const requiredPaths = new Map([
    [installerName, path.join(RELEASE_DIR, installerName)],
    [blockmapName, path.join(RELEASE_DIR, blockmapName)],
    ['latest.yml', path.join(RELEASE_DIR, 'latest.yml')],
    ['SHA256SUMS.txt', path.join(RELEASE_DIR, 'SHA256SUMS.txt')]
  ])
  const stats = await fileStats(requiredPaths, failures)
  if (failures.length) return reportFailure(failures)

  const installerPath = requiredPaths.get(installerName)
  const installerSize = stats.get(installerName).size
  const installerSha512 = await hashFile(installerPath, 'sha512', 'base64')
  const latest = parseLatestYaml(await readFile(requiredPaths.get('latest.yml'), 'utf8'), failures)
  validateLatest(latest, { version, installerName, installerSize, installerSha512 }, failures)

  const checksums = parseChecksumManifest(await readFile(requiredPaths.get('SHA256SUMS.txt'), 'utf8'), failures)
  await validateChecksums(checksums, new Map([
    [installerName, installerPath],
    [blockmapName, requiredPaths.get(blockmapName)],
    ['latest.yml', requiredPaths.get('latest.yml')]
  ]), failures)

  await validateBlockmap(installerPath, installerSize, requiredPaths.get(blockmapName), failures)
  if (failures.length) return reportFailure(failures)

  console.log(`Release artifact integrity verified for Gravuresse ${version}`)
  console.log('- latest.yml size and SHA-512 match the public installer')
  console.log('- SHA256SUMS.txt matches installer, blockmap, and latest.yml')
  console.log('- every blockmap chunk matches the public installer bytes')
}

function reportFailure(failures) {
  console.error('Release artifact integrity verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
}

await main().catch(error => {
  reportFailure([error?.message || String(error)])
})
