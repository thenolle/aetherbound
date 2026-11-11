import { join } from 'node:path'

export async function buildClientBundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, '..', 'client', 'main.ts')],
    target: 'browser',
    format: 'esm',
    minify: false
  })
  if (!result.success) throw new Error(`client build failed: ${result.logs.map(String).join('; ')}`)
  const output = result.outputs[0]
  if (output === undefined) throw new Error('client build produced no output')
  return output.text()
}