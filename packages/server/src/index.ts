import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import apiRoutes from './api'
import { setupWebSocket } from './ws'
import { initDb } from './db'

initDb()

const app = express()
const httpServer = createServer(app)
app.use(cors())
app.use(express.json())
app.use('/api', apiRoutes)
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Serve the built client so a single origin provides the app + /api + /socket.io
// (the client uses relative URLs and `io('/')`). Skipped when there's no build (dev).
const clientDist = process.env.CLIENT_DIST || resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (existsSync(clientDist)) {
  // Build id = hash of the served index.html. The client fetches this at page load and re-checks
  // it, so open pages learn that a new build was deployed (a running page never reloads by itself).
  const buildId = () => {
    try { return createHash('sha1').update(readFileSync(resolve(clientDist, 'index.html'))).digest('hex').slice(0, 12) }
    catch { return 'unknown' }
  }
  app.get('/version.json', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ buildId: buildId() })
  })

  app.use(express.static(clientDist))
  // SPA fallback for client-side routes (vue-router history mode).
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    const p = req.path
    if (p.startsWith('/api') || p.startsWith('/socket.io') || p === '/health' || p === '/version.json') return next()
    res.sendFile(resolve(clientDist, 'index.html'))
  })
  console.log(`[server] serving client from ${clientDist}`)
} else {
  console.log(`[server] client build not found at ${clientDist} (API-only)`)
}

setupWebSocket(httpServer)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
