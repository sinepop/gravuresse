import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

if (process.platform !== 'win32') {
  console.error('smoke:installer must run on Windows')
  process.exit(1)
}

const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
const installer = path.resolve('release', `gravuresse-Setup-${packageJson.version}.exe`)
const root = await mkdtemp(path.join(os.tmpdir(), 'gravuresse-installer-smoke-'))
const installDir = path.join(root, 'app')
const profileDir = path.join(root, 'profile')
const appData = path.join(profileDir, 'AppData', 'Roaming')
const localAppData = path.join(profileDir, 'AppData', 'Local')
const appExe = path.join(installDir, 'Gravuresse.exe')
const uninstaller = path.join(installDir, 'Uninstall Gravuresse.exe')
const smokeMs = Number(process.env.GRAVURESSE_INSTALLER_SMOKE_MS || 8000)
let appProcess

await access(installer)
await mkdir(appData, { recursive: true })
await mkdir(localAppData, { recursive: true })

const isolatedEnv = {
  ...process.env,
  APPDATA: appData,
  LOCALAPPDATA: localAppData,
  USERPROFILE: profileDir
}

try {
  await runAndWait(installer, ['/S', `/D=${installDir}`], isolatedEnv, 120000)
  await access(appExe)

  let output = ''
  appProcess = spawn(appExe, [], { env: { ...isolatedEnv, ELECTRON_ENABLE_LOGGING: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  appProcess.stdout.setEncoding('utf8')
  appProcess.stderr.setEncoding('utf8')
  appProcess.stdout.on('data', chunk => { output += chunk })
  appProcess.stderr.on('data', chunk => { output += chunk })

  const earlyExit = await Promise.race([
    new Promise(resolve => appProcess.once('close', code => resolve({ code }))),
    new Promise(resolve => setTimeout(() => resolve(null), smokeMs))
  ])
  if (earlyExit) throw new Error(`Installed app exited early with code ${earlyExit.code}\n${output.slice(-4000)}`)
  if (/ReferenceError|Uncaught|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(output)) {
    throw new Error(`Installed app emitted a fatal error\n${output.slice(-4000)}`)
  }

  await killTree(appProcess.pid)
  appProcess = null
  await runAndWait(uninstaller, ['/S'], isolatedEnv, 120000)
} finally {
  if (appProcess?.pid) await killTree(appProcess.pid)
  try { await access(uninstaller); await runAndWait(uninstaller, ['/S'], isolatedEnv, 120000) } catch {}
  await removeWithRetry(root)
}

console.log(`Installer smoke passed for Gravuresse ${packageJson.version}`)

function runAndWait(executable, args, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    const timer = setTimeout(() => {
      killTree(child.pid).finally(() => reject(new Error(`${path.basename(executable)} timed out\n${output.slice(-4000)}`)))
    }, timeoutMs)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(executable)} exited with code ${code}\n${output.slice(-4000)}`))
    })
  })
}

function killTree(pid) {
  if (!pid) return Promise.resolve()
  return new Promise(resolve => {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    killer.once('error', () => resolve())
    killer.once('close', () => resolve())
  })
}

async function removeWithRetry(target) {
  let lastError
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 })
      return
    } catch (error) {
      lastError = error
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  throw lastError
}
