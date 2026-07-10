import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = process.cwd()
const RELEASE_DIR = join(ROOT, 'release')
const APP_ASAR = join(RELEASE_DIR, 'win-unpacked', 'resources', 'app.asar')
const ASAR_EXTRACT_DIR = join(tmpdir(), 'gravuresse-release-secret-audit-asar')

const MAX_TEXT_BYTES = 8 * 1024 * 1024
const REDACTED = '[redacted]'

const SECRET_PATTERNS = [
  { id: 'openai-key', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { id: 'github-token', re: /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/g },
  { id: 'google-api-key', re: /AIza[0-9A-Za-z_-]{25,}/g },
  { id: 'bearer-token', re: /Bearer\s+[A-Za-z0-9_.-]{20,}/gi },
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { id: 'tencent-secret-id', re: /AKID[0-9A-Za-z]{20,}/g }
]

const FORBIDDEN_FILE_PATTERNS = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /(^|[/\\])(?:credentials|tokens|secrets|auth|cookies)\.json$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /\.(?:sqlite|sqlite3|db)$/i,
  /(^|[/\\])(?:CLAUDE|AGENTS|PRD)\.md$/i,
  /(^|[/\\])SPEC-[^/\\]+\.md$/i,
  /(^|[/\\])\.claude([/\\]|$)/i,
  /(^|[/\\])\.hermes([/\\]|$)/i
]

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.yml', '.yaml', '.toml', '.md', '.html', '.css', '.txt'
])

const KNOWN_FALSE_POSITIVE_PATHS = [
  /(^|[/\\])node_modules[/\\]/,
  /(^|[/\\])dist[/\\]build[/\\]icon\.png$/,
  /(^|[/\\])build[/\\]icon\.png$/
]

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

function isKnownFalsePositivePath(rel) {
  return KNOWN_FALSE_POSITIVE_PATHS.some((pattern) => pattern.test(rel))
}

function isProbablyText(path) {
  const lower = path.toLowerCase()
  return [...SOURCE_EXTENSIONS].some((ext) => lower.endsWith(ext))
}

function redact(value) {
  if (!value) return value
  if (value.length <= 12) return REDACTED
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function lineNumber(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

function scanText({ scope, rel, text, findings }) {
  if (isKnownFalsePositivePath(rel)) return

  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0
    let match
    while ((match = pattern.re.exec(text)) !== null) {
      const start = Math.max(0, match.index - 120)
      const end = Math.min(text.length, match.index + match[0].length + 120)
      const context = text.slice(start, end)
      const mock = /mock|test|fixture|example|placeholder|dummy|redacted|fake|sample|assert|secret-key|session-key|profile-token|acct-token|sk-abc/i.test(context)
      if (mock) continue
      findings.push({
        level: 'high',
        scope,
        type: pattern.id,
        file: rel,
        line: lineNumber(text, match.index),
        preview: redact(match[0])
      })
    }
  }

  if (/C:\\Users\\|C:\/Users\/|\/Users\/|\/home\//.test(text)) {
    findings.push({ level: 'medium', scope, type: 'local-user-path', file: rel })
  }
}

function scanFileList({ scope, files, baseDir, findings }) {
  for (const file of files) {
    const rel = toPosix(relative(baseDir, file))
    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(rel)) {
        findings.push({ level: 'high', scope, type: 'forbidden-file', file: rel })
      }
    }

    if (!isProbablyText(file)) continue
    const size = statSync(file).size
    if (size > MAX_TEXT_BYTES) continue
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
      const stats = statSync(path)
      if (stats.isDirectory()) stack.push(path)
      else if (stats.isFile()) out.push(path)
    }
  }
  return out
}

function gitTrackedFiles() {
  return run('git', ['ls-files'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => join(ROOT, file))
}

function extractAsarIfPresent(findings) {
  if (!existsSync(APP_ASAR)) {
    findings.push({ level: 'medium', scope: 'release', type: 'missing-app-asar', file: toPosix(relative(ROOT, APP_ASAR)) })
    return []
  }

  rmSync(ASAR_EXTRACT_DIR, { recursive: true, force: true })
  mkdirSync(ASAR_EXTRACT_DIR, { recursive: true })

  const localAsarBin = join(ROOT, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')
  const command = existsSync(localAsarBin) ? process.execPath : 'npx'
  const args = existsSync(localAsarBin)
    ? [localAsarBin, 'extract', APP_ASAR, ASAR_EXTRACT_DIR]
    : ['--yes', 'asar', 'extract', APP_ASAR, ASAR_EXTRACT_DIR]

  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${basename(command)} ${args.map((arg) => basename(arg) === 'asar.js' ? 'asar.js' : arg).join(' ')} failed\n${result.stdout || ''}${result.stderr || ''}`)
  }
  return walk(ASAR_EXTRACT_DIR)
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

if (existsSync(RELEASE_DIR)) {
  scanFileList({ scope: 'release-tree', files: walk(RELEASE_DIR), baseDir: RELEASE_DIR, findings })
  scanReleaseBinaryManifests(findings)
  const asarFiles = extractAsarIfPresent(findings)
  scanFileList({ scope: 'app-asar', files: asarFiles, baseDir: ASAR_EXTRACT_DIR, findings })
}

rmSync(ASAR_EXTRACT_DIR, { recursive: true, force: true })

const high = findings.filter((item) => item.level === 'high')
const medium = findings.filter((item) => item.level === 'medium')

if (findings.length) {
  console.error('Release secret audit failed:')
  for (const item of findings) {
    const line = item.line ? `:${item.line}` : ''
    console.error(`- [${item.level}] ${item.scope} ${item.type} ${item.file}${line}${item.preview ? ` (${item.preview})` : ''}`)
  }
  process.exit(high.length ? 1 : 2)
}

console.log('Release secret audit passed')
console.log('- git tracked files scanned')
console.log(existsSync(RELEASE_DIR) ? '- release tree scanned' : '- release tree missing; skipped')
console.log(existsSync(APP_ASAR) ? '- app.asar extracted and scanned' : '- app.asar missing; skipped')
