#!/usr/bin/env node
// i18n check, run by `pnpm i18n:check` and in CI. Fails when:
//  1. a key in en.json is missing from another locale (or a locale has a key en.json doesn't);
//  2. a key in en.json is never used in src/ (t('key'), tr('key'), or a `prefix.${x}` template);
//  3. a translation's {placeholders} or <tags> differ from English;
//  4. a .tsx file has user-visible text that bypasses t(): JSX text, string literals in JSX
//     expressions, and aria-label / title / placeholder / alt attributes. Brand words and
//     symbols are allowed via scripts/i18n-allow.json.
// Plural keys end in _zero/_one/_two/_few/_many/_other; every locale needs _other, the rest are optional.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSync } from 'oxc-parser'

const ROOT = new URL('..', import.meta.url).pathname
const LOCALES_DIR = join(ROOT, 'src/i18n/locales')
const SRC = join(ROOT, 'src')
const allow = JSON.parse(readFileSync(join(ROOT, 'scripts/i18n-allow.json'), 'utf8'))
const errors = []
const err = (kind, msg) => errors.push(`${kind}: ${msg}`)

const PLURAL = /_(zero|one|two|few|many|other)$/
const base = (k) => k.replace(PLURAL, '')
const load = (f) => JSON.parse(readFileSync(join(LOCALES_DIR, f), 'utf8'))

const en = load('en.json')
// While strings are being moved, extra fragments (one JSON per area) can be merged in for checking.
if (process.env.I18N_FRAGMENTS) {
  for (const f of readdirSync(process.env.I18N_FRAGMENTS).filter((x) => x.endsWith('.json'))) Object.assign(en, JSON.parse(readFileSync(join(process.env.I18N_FRAGMENTS, f), 'utf8')))
}
// I18N_ONLY=src/pages/Pay.tsx,src/pages/Home.tsx limits the source checks (literal/unknown) to those files.
const only = process.env.I18N_ONLY?.split(',').map((x) => x.trim())
const enKeys = Object.keys(en)
const enBases = new Set(enKeys.map(base))
const pluralBases = new Set(enKeys.filter((k) => PLURAL.test(k)).map(base))

const tokens = (s) => {
  const ph = [...s.matchAll(/\{(\w+)\}/g)].map((m) => `{${m[1]}}`)
  const tags = [...s.matchAll(/<(\/?\w+)>/g)].map((m) => `<${m[1]}>`)
  return [...new Set([...ph, ...tags])].sort()
}

// ---------- 1 + 3: locales ----------
for (const k of enKeys) if (typeof en[k] !== 'string' || !en[k].trim()) err('empty', `en.json "${k}"`)
for (const k of pluralBases) if (!(`${k}_other` in en)) err('plural', `en.json "${k}" has plural forms but no _other`)

for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const loc = load(file)
  for (const k of enKeys) {
    if (PLURAL.test(k) && !k.endsWith('_other')) continue // optional per language
    if (!(k in loc)) err('missing', `${file} lacks "${k}"`)
  }
  for (const [k, v] of Object.entries(loc)) {
    const b = base(k)
    if (!(k in en) && !(PLURAL.test(k) && pluralBases.has(b))) {
      err('extra', `${file} has "${k}", which en.json doesn't`)
      continue
    }
    if (typeof v !== 'string' || !v.trim()) {
      err('empty', `${file} "${k}"`)
      continue
    }
    const ref = en[k] ?? en[`${b}_other`]
    const want = tokens(ref)
    const got = tokens(v)
    const same = want.join() === got.join()
    // A plural form other than _other may drop {count} ("one" → "a member"), nothing else.
    const okPlural = PLURAL.test(k) && !k.endsWith('_other') && got.every((x) => want.includes(x)) && want.filter((x) => !got.includes(x)).every((x) => x === '{count}')
    if (!same && !okPlural) err('placeholder', `${file} "${k}": expected ${want.join(' ') || '(none)'}, got ${got.join(' ') || '(none)'}`)
  }
}

// ---------- 2 + 4: source ----------
const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|mts)$/.test(f) && !f.endsWith('.d.ts')) files.push(p)
  }
}
walk(SRC)

const used = new Set()
const prefixes = new Set()
const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'aria-valuetext'])
const allowExact = new Set(allow.exact)
const allowRe = allow.patterns.map((p) => new RegExp(p))
const isAllowed = (s) => {
  const v = s.replace(/\s+/g, ' ').trim()
  if (!v) return true
  if (!/\p{L}/u.test(v)) return true // symbols, numbers, punctuation
  if (allowExact.has(v)) return true
  return allowRe.some((re) => re.test(v))
}

function visit(node, fn, parent) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach((n) => visit(n, fn, parent))
  if (typeof node.type === 'string') fn(node, parent)
  for (const k in node) if (k !== 'parent' && node[k] && typeof node[k] === 'object') visit(node[k], fn, typeof node.type === 'string' ? node : parent)
}

const lineOf = (src, pos) => src.slice(0, pos).split('\n').length

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  const { program, errors: perr } = parseSync(file, src)
  if (perr.length) err('parse', `${rel}: ${perr[0].message}`)
  const ignored = new Set()
  src.split('\n').forEach((l, i) => l.includes('i18n-ignore') && (ignored.add(i + 1), ignored.add(i + 2)))
  const report = (node, text) => {
    const line = lineOf(src, node.start)
    if (only && !only.includes(rel)) return
    if (!ignored.has(line)) err('literal', `${rel}:${line} "${text.replace(/\s+/g, ' ').trim().slice(0, 70)}"`)
  }

  visit(program, (n, parent) => {
    // t('key') / tr('key') / t(`prefix.${x}`)
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && (n.callee.name === 't' || n.callee.name === 'tr')) {
      const a = n.arguments[0]
      if (a?.type === 'Literal' && typeof a.value === 'string') used.add(a.value)
      else if (a?.type === 'TemplateLiteral') prefixes.add(a.quasis[0].value.cooked)
      else if (a?.type === 'ConditionalExpression') for (const b of [a.consequent, a.alternate]) if (b.type === 'Literal') used.add(b.value)
    }
    // Key tables: `i18nKey: 'x.y'` or a comment-free `/* @i18n */ 'x.y'` aren't needed; plain string
    // literals that exactly match a key count as used (e.g. arrays of keys passed to t later).
    if (n.type === 'Literal' && typeof n.value === 'string' && n.value in en) used.add(n.value)
    if (n.type === 'Literal' && typeof n.value === 'string' && pluralBases.has(n.value)) used.add(n.value)

    if (!file.endsWith('.tsx')) return
    if (n.type === 'JSXText' && !isAllowed(n.value)) report(n, n.value)
    if (n.type === 'JSXAttribute' && n.name.type === 'JSXIdentifier' && ATTRS.has(n.name.name) && n.value) {
      const v = n.value
      if (v.type === 'Literal' && !isAllowed(v.value)) report(v, v.value)
      if (v.type === 'JSXExpressionContainer' && v.expression.type === 'Literal' && typeof v.expression.value === 'string' && !isAllowed(v.expression.value)) report(v, v.expression.value)
    }
    if (n.type === 'JSXExpressionContainer' && parent?.type !== 'JSXAttribute') {
      const e = n.expression
      const lits = e.type === 'Literal' ? [e] : e.type === 'ConditionalExpression' ? [e.consequent, e.alternate] : e.type === 'LogicalExpression' ? [e.right] : []
      for (const l of lits) if (l.type === 'Literal' && typeof l.value === 'string' && !isAllowed(l.value)) report(l, l.value)
      if (e.type === 'TemplateLiteral') for (const q of e.quasis) if (!isAllowed(q.value.cooked)) report(e, q.value.cooked)
    }
  })
}

for (const b of enBases) {
  if (used.has(b)) continue
  if ([...prefixes].some((p) => p && b.startsWith(p))) continue
  err('unused', `"${b}" isn't used in src/`)
}
for (const k of used) if (!(k in en) && !pluralBases.has(k) && /^[a-z][\w-]*(\.[\w-]+)+$/.test(k)) err('unknown', `t("${k}") has no entry in en.json`)

if (errors.length) {
  const byKind = {}
  for (const e of errors) (byKind[e.split(':')[0]] ??= []).push(e)
  for (const [k, list] of Object.entries(byKind)) {
    console.error(`\n${k} (${list.length})`)
    for (const e of list.slice(0, Number(process.env.I18N_MAX ?? 200))) console.error('  ' + e.slice(k.length + 2))
    if (list.length > 200) console.error(`  … and ${list.length - 200} more`)
  }
  console.error(`\ni18n check failed: ${errors.length} problem(s).`)
  process.exit(1)
}
console.log(`i18n check passed: ${enKeys.length} keys, ${readdirSync(LOCALES_DIR).length} locales, ${files.length} source files.`)
