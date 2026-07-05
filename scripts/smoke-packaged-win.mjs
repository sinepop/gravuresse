import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const fatalPatterns = [
  /ReferenceError/i,
  /ErrorBoundary caught/i,
  /\bUncaught\b/i
]
const timeoutMs = Number(process.env.GRAVURESSE_SMOKE_TIMEOUT_MS || 10000)

if (process.platform !== 'win32') {
  console.error('smoke:packaged must run on Windows against release/win-unpacked/Gravuresse.exe')
  process.exit(1)
}

const exePath = path.resolve('release', 'win-unpacked', 'Gravuresse.exe')

try {
  await access(exePath)
} catch {
  console.error(`Packaged app not found: ${exePath}`)
  console.error('Run npm run package:dir first.')
  process.exit(1)
}

const profileRoot = await mkdtemp(path.join(os.tmpdir(), 'gravuresse-smoke-'))
const appData = path.join(profileRoot, 'AppData', 'Roaming')
const localAppData = path.join(profileRoot, 'AppData', 'Local')
await mkdir(appData, { recursive: true })
await mkdir(localAppData, { recursive: true })

let output = ''
let timedOut = false
let child

try {
  child = spawn(exePath, [], {
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      USERPROFILE: profileRoot,
      ELECTRON_ENABLE_LOGGING: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    output += chunk
  })
  child.stderr.on('data', chunk => {
    output += chunk
  })

  const result = await new Promise(resolve => {
    const timer = setTimeout(() => {
      timedOut = true
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
    }, timeoutMs)

    child.on('error', error => {
      clearTimeout(timer)
      resolve({ error })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })

  const fatalMatch = fatalPatterns.find(pattern => pattern.test(output))
  if (fatalMatch) {
    console.error(`Packaged smoke failed: matched ${fatalMatch}`)
    printCapturedOutput()
    process.exit(1)
  }

  if (result.error) {
    console.error(`Packaged smoke failed to launch: ${result.error.message}`)
    process.exit(1)
  }

  if (!timedOut && result.code !== 0) {
    console.error(`Packaged smoke failed: process exited with code ${result.code}`)
    printCapturedOutput()
    process.exit(1)
  }

  console.log(`Packaged smoke passed (${timedOut ? `no fatal output for ${timeoutMs}ms` : 'process exited cleanly'})`)
} finally {
  await rm(profileRoot, { recursive: true, force: true })
}

function printCapturedOutput() {
  const trimmed = output.trim()
  if (!trimmed) return
  console.error('Captured packaged output:')
  console.error(trimmed.slice(-8000))
}
