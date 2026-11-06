import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Render the maintained semantic token source into its checked-in CSS artifact.
 * Selectors and layer are the package's existing theme contract; this does not
 * retrieve Figma variables or establish parity with the live design file.
 */
export function renderTokenCSS(tokens) {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens) ||
      Object.keys(tokens).sort().join(',') !== 'dark,light') throw new Error('Expected light and dark token modes')
  const lines = ['/* Semantic colors resolved from Figma Light/Dark variables. */', '@layer components {']
  let names
  for (const [mode, selector] of [
    ['light', '.ov, [data-ovelle-theme]'],
    ['dark', '[data-ovelle-theme="dark"], [data-ovelle-theme="dark"] .ov'],
  ]) {
    const values = tokens[mode]
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) throw new Error(`Empty or invalid ${mode} token mode`)
    const keys = Object.keys(values).sort()
    if (names && JSON.stringify(keys) !== JSON.stringify(names)) throw new Error('Light and dark token names must match')
    names = keys
    const properties = new Set()
    lines.push(`  ${selector} {`)
    for (const [name, color] of Object.entries(values)) {
      if (!/^[a-z]+(?:[-/][a-z]+)*$/.test(name) || typeof color !== 'string' || !/^#[0-9a-f]{6}$/.test(color)) {
        throw new Error(`Invalid ${mode} token: ${name}`)
      }
      const property = `--ov-${name.replaceAll('/', '-')}`
      if (properties.has(property) || properties.has(`${property}-channels`)) throw new Error(`Colliding CSS token: ${name}`)
      properties.add(property); properties.add(`${property}-channels`)
      const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).join(' ')
      lines.push(`    ${property}: ${color};`, `    ${property}-channels: ${channels};`)
    }
    lines.push('  }')
  }
  return [...lines, '}', ''].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  if (process.argv.length !== 3 || !['--check', '--write'].includes(mode)) throw new Error('Expected --check or --write')
  const source = new URL('../packages/ui/tokens.json', import.meta.url)
  const destination = new URL('../packages/ui/src/tokens.css', import.meta.url)
  const css = renderTokenCSS(JSON.parse(await readFile(source, 'utf8')))
  if (mode === '--write') await writeFile(destination, css)
  else if (await readFile(destination, 'utf8') !== css) {
    throw new Error('Token CSS drift: review tokens.json, then run npm run tokens:generate -w @ovelle/ui')
  }
  console.log(mode === '--check' ? 'Semantic token CSS matches tokens.json' : 'Generated semantic token CSS')
}
