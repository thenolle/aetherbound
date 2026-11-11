const manifest = await Bun.file('package.json').json() as { dependencies?: Record<string, string> }
const runtime = Object.keys(manifest.dependencies ?? {})

if (runtime.length > 0) {
  console.error(`forbidden runtime dependencies: ${runtime.join(', ')}`)
  process.exit(1)
}
console.log('deps:check ok - zero runtime dependencies')