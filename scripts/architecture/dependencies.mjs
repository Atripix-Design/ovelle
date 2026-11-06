import ts from 'typescript'
import { builtinModules } from 'node:module'
import { posix } from 'node:path'

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')))
export const isCode = path => /\.[cm]?[jt]sx?$/.test(path)

/** Read syntax rather than matching text: comments and strings are not imports. */
export function dependencies(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const result = []
  const add = node => {
    if (!node) return
    result.push({ specifier: ts.isStringLiteralLike(node) ? node.text : null,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier)
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

export function resolveLocal(from, specifier, files, mappings = []) {
  let base = posix.normalize(posix.join(posix.dirname(from), specifier))
  for (const mapping of mappings) if (base.startsWith(mapping.output)) base = mapping.source + base.slice(mapping.output.length)
  // ESM source imports deliberately use output extensions; resolve to source first.
  const stem = base.replace(/\.[cm]?jsx?$/, '')
  const candidates = [stem + '.ts', stem + '.tsx', stem + '.mts', stem + '.cts', base,
    ...['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.js'].map(ext => base + ext)]
  return candidates.find(candidate => files.has(candidate))
}

export function classify(path, zones) {
  const contains = root => path === root || path.startsWith(root.endsWith('/') ? root : root + '/')
  const matches = zones.filter(zone => zone.roots.some(contains) && !(zone.excludes ?? []).some(contains))
  if (matches.length !== 1) throw new Error(`${path}: expected one architecture owner, found ${matches.length}`)
  return matches[0]
}

export function analyze(sources, config, packageExports = {}) {
  const files = new Set(Object.keys(sources)), graph = new Map(), violations = []
  const report = (rule, from, target) => violations.push({ rule, from, target })
  for (const [from, text] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isCode(from)) continue
    const zone = classify(from, config.zones)
    graph.set(from, [])
    for (const { specifier, line } of dependencies(from, text)) {
      if (specifier === null) {
        report('dynamic-import', from, `line:${line}`)
        continue
      }
      // These forms can name source outside the relative resolver. Treating them
      // as npm packages would silently bypass ownership and dependency checks.
      // Add explicit resolution and negative fixtures before supporting an alias.
      if (specifier.startsWith('/') || specifier.startsWith('\\') || specifier.startsWith('#') ||
          (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier) && !specifier.startsWith('node:') && !(zone.virtualModules ?? []).includes(specifier))) {
        report('unsupported-import-specifier', from, specifier)
        continue
      }
      if (specifier.startsWith('.')) {
        const target = resolveLocal(from, specifier, files, config.sourceMappings)
        if (!target) { report('unresolved-local-import', from, specifier); continue }
        if (!isCode(target)) continue
        const other = classify(target, config.zones)
        graph.get(from).push(target)
        if (other.id !== zone.id && !zone.allowed.includes(other.id)) report('dependency-direction', from, target)
        if (other.id !== zone.id && other.public && !other.public.includes(target)) report('private-import', from, target)
      } else {
        if (zone.external && !zone.external.some(name => specifier === name || specifier.startsWith(name + '/'))) report('external-dependency', from, specifier)
        if (!zone.node && (specifier.startsWith('node:') || builtins.has(specifier))) report('node-in-browser', from, specifier)
        if (!zone.electron && (specifier === 'electron' || specifier.startsWith('electron/'))) report('native-boundary', from, specifier)
        for (const [name, exports] of Object.entries(packageExports)) {
          if (specifier !== name && !specifier.startsWith(name + '/')) continue
          const subpath = specifier === name ? '.' : './' + specifier.slice(name.length + 1)
          if (!exports.includes(subpath)) report('private-package-import', from, specifier)
        }
        if (zone.id === 'ui' && !['react', 'react-dom', '@fontsource/inter'].some(name => specifier === name || specifier.startsWith(name + '/'))) report('ui-external-dependency', from, specifier)
      }
    }
  }
  // Report each back edge once; retain type-only dependencies because they also
  // couple module contracts. A runtime-only graph would miss architectural cycles.
  const complete = new Set(), active = []
  function visit(file) {
    if (active.includes(file)) return
    if (complete.has(file)) return
    active.push(file)
    for (const target of [...new Set(graph.get(file) || [])].sort()) {
      if (active.includes(target)) report('cycle', file, target)
      else visit(target)
    }
    active.pop()
    complete.add(file)
  }
  for (const file of [...graph.keys()].sort()) visit(file)
  return [...new Map(violations.map(item => [JSON.stringify(item), item])).values()]
}
