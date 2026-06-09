/**
 * Patches @inngest/agent-kit so Inngest step IDs are unique per network/agent run.
 * Re-run after `pnpm install` if duplicate-step warnings return.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const targets = [
  'node_modules/@inngest/agent-kit/dist/chunk-BSWKEFTT.js',
  'node_modules/@inngest/agent-kit/dist/index.cjs',
]

const replacements = [
  [
    'stepTools.run("generate-network-id", () => {',
    'stepTools.run(`generate-network-id-${this.name}`, () => {',
  ],
  [
    '`generate-agent-ids-${this._counter}`',
    '`generate-agent-ids-${this.name}-${this._counter}`',
  ],
]

let filesOk = 0
for (const rel of targets) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) {
    console.warn(`[patch-agent-kit] missing ${rel}`)
    continue
  }
  let src = fs.readFileSync(file, 'utf8')
  let changed = false
  for (const [from, to] of replacements) {
    if (src.includes(to)) continue
    if (!src.includes(from)) {
      console.warn(`[patch-agent-kit] pattern not found in ${rel}: ${from.slice(0, 50)}`)
      continue
    }
    src = src.replaceAll(from, to)
    changed = true
  }
  if (changed) {
    fs.writeFileSync(file, src)
    console.log(`[patch-agent-kit] patched ${rel}`)
  }
  filesOk++
}

if (filesOk === 0) {
  console.warn('[patch-agent-kit] no files patched')
}
