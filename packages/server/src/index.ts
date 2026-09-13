import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import apiRoutes from './api'
import { setupWebSocket } from './ws'
import { initDb } from './db'
import { cleanupStaleRooms } from './room'

initDb()
setInterval(() => cleanupStaleRooms(), 60_000).unref()

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
  app.use(express.static(clientDist))
  // SPA fallback for client-side routes (vue-router history mode).
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    const p = req.path
    if (p.startsWith('/api') || p.startsWith('/socket.io') || p === '/health') return next()
    res.sendFile(resolve(clientDist, 'index.html'))
  })
  console.log(`[server] serving client from ${clientDist}`)
} else {
  console.log(`[server] client build not found at ${clientDist} (API-only)`)
}

setupWebSocket(httpServer)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
