import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

export type Role = 'admin' | 'user'

export interface UserRow {
  id: string
  username: string
  password_hash: string
  role: Role
  wins: number
  boxer_wins: number
  created_at: number
}

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'data/app.db')
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      boxer_wins INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)
  // Seed admin from env if configured and missing. Other registrations are normal users.
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  if (username && password && !findUserByUsername(username)) {
    createUser(username, bcrypt.hashSync(password, 10), 'admin')
  }
  if (countAdmins() === 0) {
    console.warn('[db] no admin account exists — set ADMIN_USERNAME/ADMIN_PASSWORD to seed one')
  }
}

export function createUser(username: string, passwordHash: string, role: Role = 'user'): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    username,
    password_hash: passwordHash,
    role,
    wins: 0,
    boxer_wins: 0,
    created_at: Date.now(),
  }
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, wins, boxer_wins, created_at) VALUES (@id,@username,@password_hash,@role,@wins,@boxer_wins,@created_at)'
  ).run(row)
  return row
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
}
export function findUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}
export function listUsers(): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[]
}
export function deleteUser(id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}
export function setRole(id: string, role: Role): void {
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
}
export function resetStats(id: string): void {
  db.prepare('UPDATE users SET wins = 0, boxer_wins = 0 WHERE id = ?').run(id)
}
export function addStats(id: string, wins: number, boxerWins: number): void {
  db.prepare('UPDATE users SET wins = wins + ?, boxer_wins = boxer_wins + ? WHERE id = ?').run(wins, boxerWins, id)
}
export function leaderboard(metric: 'wins' | 'boxerWins'): UserRow[] {
  const order = metric === 'boxerWins' ? 'boxer_wins DESC, wins DESC' : 'wins DESC, boxer_wins DESC'
  return db.prepare(`SELECT * FROM users ORDER BY ${order}`).all() as UserRow[]
}
export function countAdmins(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n
}
