const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const repoRoot = path.resolve(__dirname, '..')
const prototypePath = path.join(repoRoot, 'docs', 'prototypes', 'gravuresse-vision-prototype.html')
const outputDir = path.join(repoRoot, 'docs', 'prototypes', 'vision-screens')

const screens = [
  ['01-default-creative-workspace', 1440, 960],
  ['02-prompt-agent-panel', 1440, 960],
  ['03-stable-edit-mode', 1440, 960],
  ['04-provider-capability-config', 1440, 960],
  ['05-multi-thread-context', 1440, 960],
  ['06-pipeline-advanced-view', 1440, 960],
  ['07-infinite-canvas-lineage', 1440, 960],
  ['08-vision-ui-specification', 1440, 960]
]

async function captureOne(win, name, width, height) {
  win.setSize(width, height)
  const targetUrl = `file://${prototypePath}?screen=${encodeURIComponent(name)}`
  await win.loadURL(targetUrl)
  await new Promise((resolve) => setTimeout(resolve, 180))
  const image = await win.capturePage()
  const outputPath = path.join(outputDir, `${name}.png`)
  fs.writeFileSync(outputPath, image.toPNG())
  const size = fs.statSync(outputPath).size
  if (size < 50_000) {
    throw new Error(`Screenshot too small: ${outputPath} (${size} bytes)`)
  }
  return outputPath
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true })
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.png')) fs.unlinkSync(path.join(outputDir, file))
  }

  const errors = []
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    backgroundColor: '#f5f2ec',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) errors.push(message)
  })

  try {
    const outputs = []
    for (const [name, width, height] of screens) {
      outputs.push(await captureOne(win, name, width, height))
    }
    if (errors.length) {
      throw new Error(`Console errors during capture:\n${errors.join('\n')}`)
    }
    console.log(outputs.join('\n'))
  } finally {
    win.destroy()
    app.quit()
  }
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
