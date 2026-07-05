import path from 'node:path'
import ts from 'typescript'

const entrypoints = [
  'src/App.jsx',
  'src/hooks/useChat.js'
]

const rootDir = process.cwd()
const tsconfigPath = path.join(rootDir, 'tsconfig.json')
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)

if (configFile.error) {
  reportDiagnostic(configFile.error)
  process.exit(1)
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir)
const program = ts.createProgram(entrypoints, {
  ...parsed.options,
  allowJs: true,
  checkJs: true,
  noEmit: true,
  skipLibCheck: true
})

const unresolvedNameCodes = new Set([2304, 2552])
const checkedFiles = new Set(entrypoints.map(file => path.resolve(rootDir, file)))
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter(diagnostic => {
    if (!unresolvedNameCodes.has(diagnostic.code) || !diagnostic.file) return false
    return checkedFiles.has(path.resolve(diagnostic.file.fileName))
  })

if (diagnostics.length > 0) {
  console.error('Entrypoint unresolved references found:')
  for (const diagnostic of diagnostics) reportDiagnostic(diagnostic)
  process.exit(1)
}

console.log(`Checked entrypoint globals: ${entrypoints.join(', ')}`)

function reportDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (!diagnostic.file || typeof diagnostic.start !== 'number') {
    console.error(message)
    return
  }
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  const relative = path.relative(rootDir, diagnostic.file.fileName).replaceAll(path.sep, '/')
  console.error(`${relative}:${location.line + 1}:${location.character + 1} - ${message}`)
}
