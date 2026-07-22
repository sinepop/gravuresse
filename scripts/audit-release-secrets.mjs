import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = process.cwd()
const RELEASE_DIR = join(ROOT, 'release')
const APP_ASAR = join(RELEASE_DIR, 'win-unpacked', 'resources', 'app.asar')
const SOURCE_ONLY = process.argv.includes('--source-only')

const MAX_TEXT_BYTES = 32 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi

const SECRET_PATTERNS = [
  { id: 'openai-key', re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g },
  { id: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'pypi-token', re: /\bpypi-[A-Za-z0-9_-]{50,}\b/g },
  { id: 'huggingface-token', re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { id: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{25,}\b/g },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'tencent-secret-id', re: /\bAKID[0-9A-Za-z]{20,}\b/g },
  { id: 'credentialed-url', re: /\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/gi }
]

const FORBIDDEN_FILE_PATTERNS = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /(^|[/\\])\.envrc$/i,
  /(^|[/\\])(?:\.npmrc|\.netrc|_netrc|\.git-credentials)$/i,
  /(^|[/\\])\.(?:ssh|aws|azure|kube)([/\\]|$)/i,
  /(^|[/\\])(?:credentials|tokens|secrets|auth|cookies)\.json$/i,
  /(^|[/\\])(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /\.(?:kdbx|har)$/i,
  /\.(?:sqlite|sqlite3|db)$/i,
  /(?:\.bak|\.backup|\.old|\.orig|~)$/i,
  /(^|[/\\])(?:CLAUDE|AGENTS|PRD)\.md$/i,
  /(^|[/\\])SPEC-[^/\\]+\.md$/i,
  /(^|[/\\])\.codex([/\\]|$)/i,
  /(^|[/\\])\.claude([/\\]|$)/i,
  /(^|[/\\])\.hermes([/\\]|$)/i
]

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.yml', '.yaml', '.toml', '.md', '.html', '.css', '.txt',
  '.map', '.xml', '.ini', '.conf', '.properties', '.sh', '.ps1'
])

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout || ''}${result.stderr || ''}`)
  }
  return result.stdout
}

function toPosix(path) {
  return path.split(sep).join('/')
}

function isProbablyText(path) {
  return SOURCE_EXTENSIONS.has(extname(path).toLowerCase())
}

function lineNumber(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

function scanText({ scope, rel, text, findings }) {
  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0
    let match
    while ((match = pattern.re.exec(text)) !== null) {
      findings.push({
        level: 'high',
        scope,
        type: pattern.id,
        file: rel,
        line: lineNumber(text, match.index)
      })
    }
  }

  const dependencyLockfile = /(^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(rel)
  if (scope === 'git-tracked' && !dependencyLockfile) {
    EMAIL_PATTERN.lastIndex = 0
    let match
    while ((match = EMAIL_PATTERN.exec(text)) !== null) {
      if (/@(?:users\.noreply\.github\.com|example\.(?:com|org|net|invalid))$/i.test(match[0])) continue
      findings.push({
        level: 'high',
        scope,
        type: 'email-address',
        file: rel,
        line: lineNumber(text, match.index)
      })
    }
  }

  if (/C:\\Users\\|C:\/Users\/|\/Users\/|\/home\//.test(text)) {
    findings.push({ level: 'medium', scope, type: 'local-user-path', file: rel })
  }
}

function scanPngMetadata({ scope, rel, file, findings }) {
  const buffer = readFileSync(file)
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return

  let offset = PNG_SIGNATURE.length
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > buffer.length) return
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'caBX') {
      findings.push({ level: 'high', scope, type: 'png-provenance-metadata', file: rel })
      return
    }
    offset = end
  }
}

function scanFileList({ scope, files, baseDir, findings }) {
  for (const file of files) {
    if (!existsSync(file)) continue
    const rel = toPosix(relative(baseDir, file))
    if (FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(rel))) {
      findings.push({ level: 'high', scope, type: 'forbidden-file', file: rel })
      continue
    }
    const stats = lstatSync(file)
    if (stats.isSymbolicLink()) {
      findings.push({ level: 'high', scope, type: 'symbolic-link', file: rel })
      continue
    }

    if (extname(file).toLowerCase() === '.png') scanPngMetadata({ scope, rel, file, findings })
    if (!isProbablyText(file)) continue
    const size = stats.size
    if (size > MAX_TEXT_BYTES) {
      findings.push({ level: 'medium', scope, type: 'oversize-text-not-scanned', file: rel })
      continue
    }
    const text = readFileSync(file, 'utf8')
    scanText({ scope, rel, text, findings })
  }
}

function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      const stats = lstatSync(path)
      if (stats.isSymbolicLink()) out.push(path)
      else if (stats.isDirectory()) stack.push(path)
      else if (stats.isFile()) out.push(path)
    }
  }
  return out
}

function gitTrackedFiles() {
  return run('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => join(ROOT, file))
}

function extractAsarIfPresent(findings) {
  if (!existsSync(APP_ASAR)) {
    findings.push({ level: 'medium', scope: 'release', type: 'missing-app-asar', file: toPosix(relative(ROOT, APP_ASAR)) })
    return { dir: null, files: [] }
  }

  const extractDir = mkdtempSync(join(tmpdir(), 'gravuresse-release-secret-audit-asar-'))

  const localAsarBin = join(ROOT, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')
  const command = existsSync(localAsarBin) ? process.execPath : 'npx'
  const args = existsSync(localAsarBin)
    ? [localAsarBin, 'extract', APP_ASAR, extractDir]
    : ['--yes', 'asar', 'extract', APP_ASAR, extractDir]

  try {
    const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`${basename(command)} ${args.map((arg) => basename(arg) === 'asar.js' ? 'asar.js' : arg).join(' ')} failed\n${result.stdout || ''}${result.stderr || ''}`)
    }
    return { dir: extractDir, files: walk(extractDir) }
  } catch (error) {
    rmSync(extractDir, { recursive: true, force: true })
    throw error
  }
}

function scanReleaseBinaryManifests(findings) {
  const releaseFiles = [
    join(RELEASE_DIR, 'latest.yml'),
    join(RELEASE_DIR, 'SHA256SUMS.txt'),
    join(RELEASE_DIR, `gravuresse-Setup-${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}.exe.blockmap`)
  ]

  for (const file of releaseFiles) {
    if (!existsSync(file)) continue
    const rel = toPosix(relative(ROOT, file))
    const text = readFileSync(file, 'utf8')
    scanText({ scope: 'release-manifest', rel, text, findings })
  }
}

const findings = []

scanFileList({ scope: 'git-tracked', files: gitTrackedFiles(), baseDir: ROOT, findings })

let asarExtractDir = null
try {
  if (!SOURCE_ONLY && existsSync(RELEASE_DIR)) {
    scanFileList({ scope: 'release-tree', files: walk(RELEASE_DIR), baseDir: RELEASE_DIR, findings })
    scanReleaseBinaryManifests(findings)
    const extracted = extractAsarIfPresent(findings)
    asarExtractDir = extracted.dir
    if (asarExtractDir) {
      scanFileList({ scope: 'app-asar', files: extracted.files, baseDir: asarExtractDir, findings })
    }
  }
} finally {
  if (asarExtractDir) rmSync(asarExtractDir, { recursive: true, force: true })
}

const high = findings.filter((item) => item.level === 'high')
const medium = findings.filter((item) => item.level === 'medium')

if (findings.length) {
  console.error('Release secret audit failed:')
  for (const item of findings) {
    const line = item.line ? `:${item.line}` : ''
    console.error(`- [${item.level}] ${item.scope} ${item.type} ${item.file}${line}`)
  }
  process.exit(high.length ? 1 : 2)
}

console.log('Release secret audit passed')
console.log('- tracked and unignored source files scanned')
console.log(!SOURCE_ONLY && existsSync(RELEASE_DIR) ? '- release tree scanned' : '- release tree skipped')
console.log(!SOURCE_ONLY && existsSync(APP_ASAR) ? '- app.asar extracted and scanned' : '- app.asar skipped')
