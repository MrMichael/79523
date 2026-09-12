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
    CREATE TABLE IF NOT EXISTS play_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      seconds INTEGER NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      boxer_wins INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_play_log_user_at ON play_log (user_id, at);
  `)
  // Migrate tables created before the wins columns existed.
  const playCols = (db.prepare('PRAGMA table_info(play_log)').all() as { name: string }[]).map(c => c.name)
  if (!playCols.includes('wins')) db.exec('ALTER TABLE play_log ADD COLUMN wins INTEGER NOT NULL DEFAULT 0')
  if (!playCols.includes('boxer_wins')) db.exec('ALTER TABLE play_log ADD COLUMN boxer_wins INTEGER NOT NULL DEFAULT 0')
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

/** Record one finished game for an account: play time plus the wins/boxer wins it earned. */
export function addGameLog(userId: string, at: number, seconds: number, wins: number, boxerWins: number): void {
  db.prepare('INSERT INTO play_log (user_id, at, seconds, wins, boxer_wins) VALUES (?, ?, ?, ?, ?)').run(
    userId, at, Math.max(0, Math.round(seconds)), wins, boxerWins
  )
}

export interface RecentTotals {
  seconds: number
  wins: number
  boxerWins: number
}

/** Per-account totals (play seconds / wins / boxer wins) for games recorded at/after `since`. */
export function recentTotals(since: number): Map<string, RecentTotals> {
  const rows = db.prepare(
    'SELECT user_id, SUM(seconds) AS seconds, SUM(wins) AS wins, SUM(boxer_wins) AS boxerWins FROM play_log WHERE at >= ? GROUP BY user_id'
  ).all(since) as { user_id: string; seconds: number; wins: number; boxerWins: number }[]
  return new Map(rows.map(r => [r.user_id, { seconds: r.seconds, wins: r.wins, boxerWins: r.boxerWins }]))
}
export function leaderboard(metric: 'wins' | 'boxerWins'): UserRow[] {
  const order = metric === 'boxerWins' ? 'boxer_wins DESC, wins DESC' : 'wins DESC, boxer_wins DESC'
  return db.prepare(`SELECT * FROM users ORDER BY ${order}`).all() as UserRow[]
}
export function countAdmins(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n
}
