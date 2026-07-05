import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const releaseDir = path.resolve('release')
const outputName = 'SHA256SUMS.txt'

async function main() {
  const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
  const version = packageJson.version
  const currentReleaseFiles = new Set([
    `gravuresse-Setup-${version}.exe`,
    `gravuresse-Setup-${version}.exe.blockmap`,
    'latest.yml'
  ])
  let entries
  try {
    entries = await readdir(releaseDir, { withFileTypes: true })
  } catch {
    console.error('release directory does not exist')
    process.exitCode = 1
    return
  }

  const files = entries
    .filter(entry => entry.isFile() && currentReleaseFiles.has(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
  if (files.length === 0) {
    console.error(`No release files found for version ${version}`)
    process.exitCode = 1
    return
  }

  const lines = []
  for (const file of files) {
    const bytes = await readFile(path.join(releaseDir, file))
    const hash = createHash('sha256').update(bytes).digest('hex')
    lines.push(`${hash}  ${file}`)
  }

  await writeFile(path.join(releaseDir, outputName), `${lines.join('\n')}\n`, 'utf8')
  console.log(`Wrote release/${outputName}`)
}

await main()
