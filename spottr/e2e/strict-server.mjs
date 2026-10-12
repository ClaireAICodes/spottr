import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const root = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const file = resolve(root, pathname.slice('/spottr/'.length) || 'index.html')
  if (!pathname.startsWith('/spottr/') || !file.startsWith(root + sep)) {
    response.writeHead(404).end()
    return
  }
  try {
    const bytes = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
  } catch { response.writeHead(404).end() }
}).listen(4173, '127.0.0.1')
