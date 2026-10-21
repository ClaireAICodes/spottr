// A retained diagnostic is deliberately not labelled an importable backup.
// Encode native Blob bytes explicitly; JSON.stringify(Blob) would lose them.
export async function recoveryDiagnostic(value: unknown): Promise<Blob> {
  const visited = new WeakSet<object>()
  async function encode(item: unknown, depth = 0): Promise<unknown> {
    if (depth > 100) throw new Error('Recovery evidence is too deeply nested to package safely')
    if (item === undefined) return { type: 'undefined' }
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number') return item
    if (typeof item !== 'object') throw new Error('Recovery evidence contains an unsupported stored value')
    if (visited.has(item)) throw new Error('Recovery evidence contains a cycle; keep the recovery storage intact')
    visited.add(item)
    try {
      if (Object.prototype.toString.call(item) === '[object Blob]') {
        const blob = item as Blob
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        return { type: 'Blob', mimeType: blob.type, size: blob.size, dataUrl }
      }
      if (Array.isArray(item)) return Promise.all(item.map(child => encode(child, depth + 1)))
      if (Object.prototype.toString.call(item) !== '[object Object]') throw new Error('Recovery evidence contains an unsupported stored object')
      return { type: 'record', entries: await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await encode(child, depth + 1)])) }
    } finally { visited.delete(item) }
  }
  const result = new Blob([JSON.stringify({ format: 'spottr-recovery-diagnostic', version: 1, retained: await encode(value) })], { type: 'application/json' })
  if (result.size > 40 * 1024 * 1024) throw new Error('Recovery evidence is too large to download safely. Keep the recovery storage and original backup intact.')
  return result
}
