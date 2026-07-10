import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const RELEASE_DIR = join(ROOT, 'release')
const GENERATED_LOCAL_METADATA = [
  'builder-debug.yml'
]

let removed = 0
for (const name of GENERATED_LOCAL_METADATA) {
  const path = join(RELEASE_DIR, name)
  if (existsSync(path)) {
    rmSync(path, { force: true })
    removed += 1
    console.log(`Removed local release metadata: release/${name}`)
  }
}

if (!removed) {
  console.log('No local release metadata to remove')
}
