#!/usr/bin/env node
// Merge per-area English fragments into src/i18n/locales/en.json. Usage: node scripts/i18n-merge.mjs <dir>
// Fails if two fragments define the same key with different English.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
const enPath = new URL('../src/i18n/locales/en.json', import.meta.url).pathname
const en = JSON.parse(readFileSync(enPath, 'utf8'))
let bad = 0
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const frag = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  for (const [k, v] of Object.entries(frag)) {
    if (k in en && en[k] !== v) {
      console.error(`conflict ${f} "${k}": "${en[k]}" vs "${v}"`)
      bad++
    } else en[k] = v
  }
}
if (bad) process.exit(1)
writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n')
console.log(`en.json: ${Object.keys(en).length} keys`)
