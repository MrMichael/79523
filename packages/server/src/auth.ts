import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createUser, findUserByUsername } from './db'
import type { Role, UserRow } from './db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_TTL = '7d'
const USERNAME_RE = /^[\p{L}\p{N}_]{2,12}$/u

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10)
}
export function verifyPassword(pw: string, hash: string): boolean {
  return bcrypt.compareSync(pw, hash)
}

export function signToken(user: { id: string; role: Role }): string {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}
export function verifyToken(token: string): { uid: string; role: Role } | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { uid: string; role: Role }
    return { uid: p.uid, role: p.role }
  } catch {
    return null
  }
}

export function publicUser(u: UserRow, online = false) {
  return { id: u.id, username: u.username, role: u.role, wins: u.wins, boxerWins: u.boxer_wins, online }
}

export function registerUser(username: string, password: string): UserRow {
  if (!USERNAME_RE.test(username)) throw new Error('用户名需为 2-12 位中文/字母/数字/下划线')
  if (password.length < 6) throw new Error('密码至少 6 位')
  if (findUserByUsername(username)) throw new Error('用户名已存在')
  return createUser(username, hashPassword(password))
}

export function authenticate(username: string, password: string): UserRow | null {
  const u = findUserByUsername(username)
  if (!u || !verifyPassword(password, u.password_hash)) return null
  return u
}
