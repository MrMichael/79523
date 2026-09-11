import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from './auth'
import { findUserById } from './db'
import type { UserRow } from './db'

export interface AuthedRequest extends Request {
  user?: UserRow
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const payload = token ? verifyToken(token) : null
  if (!payload) { res.status(401).json({ error: 'unauthorized' }); return }
  const user = findUserById(payload.uid)
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return }
  req.user = user
  next()
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: 'unauthorized' }); return }
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'forbidden' }); return }
  next()
}
