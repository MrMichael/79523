import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import apiRoutes from './api'
import { setupWebSocket } from './ws'

const app = express()
const httpServer = createServer(app)
app.use(cors())
app.use(express.json())
app.use('/api', apiRoutes)
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
setupWebSocket(httpServer)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
