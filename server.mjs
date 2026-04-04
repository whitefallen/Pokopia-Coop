import { createReadStream, existsSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = Number(process.env.PORT ?? 4173)
const DIST_DIR = join(process.cwd(), 'dist')
const INDEX_PATH = join(DIST_DIR, 'index.html')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const sessionSockets = new Map()

function getSessionIdFromRequest(req) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  return url.searchParams.get('session')?.trim()
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname)
  const normalizedPath = normalize(decoded).replace(/^[/\\]+/, '')
  const resolved = resolve(DIST_DIR, normalizedPath)
  const distPrefix = `${DIST_DIR}/`
  if (resolved !== DIST_DIR && !resolved.startsWith(distPrefix)) {
    return DIST_DIR
  }
  return resolved
}

function serveFile(res, path, fallbackToIndex = true) {
  if (!existsSync(path)) {
    if (fallbackToIndex) {
      return serveFile(res, INDEX_PATH, false)
    }
    res.statusCode = 404
    res.end('Not found')
    return
  }

  const ext = extname(path).toLowerCase()
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream')
  createReadStream(path).pipe(res)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const path = safePath(pathname)
  const shouldFallbackToSpa = !pathname.startsWith('/assets/') && extname(pathname) === ''
  serveFile(res, path, shouldFallbackToSpa)
})

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (socket, req, sessionId) => {
  let peers = sessionSockets.get(sessionId)
  if (!peers) {
    peers = new Set()
    sessionSockets.set(sessionId, peers)
  }
  peers.add(socket)

  socket.on('message', (data) => {
    const sessionPeers = sessionSockets.get(sessionId)
    if (!sessionPeers) {
      return
    }
    for (const peer of sessionPeers) {
      if (peer === socket || peer.readyState !== WebSocket.OPEN) {
        continue
      }
      peer.send(data)
    }
  })

  socket.on('close', () => {
    const sessionPeers = sessionSockets.get(sessionId)
    if (!sessionPeers) {
      return
    }
    sessionPeers.delete(socket)
    if (sessionPeers.size === 0) {
      sessionSockets.delete(sessionId)
    }
  })
})

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) {
    socket.destroy()
    return
  }

  const sessionId = getSessionIdFromRequest(req)
  if (!sessionId) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, sessionId)
  })
})

server.listen(PORT, HOST)
