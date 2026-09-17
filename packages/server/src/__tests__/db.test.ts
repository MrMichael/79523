import { describe, test, expect, beforeEach } from '@jest/globals'
import { initDb, db, createUser, findUserByUsername, findUserById, listUsers, deleteUser, setRole, resetStats, addStats, leaderboard, countAdmins, addGameLog, recentTotals } from '../db'

describe('db layer', () => {
  beforeEach(() => {
    initDb()
    db.exec('DELETE FROM users')
    db.exec('DELETE FROM play_log')
  })

  test('create + find user', () => {
    const u = createUser('alice', 'hash')
    expect(u.username).toBe('alice')
    expect(u.role).toBe('user')
    expect(findUserByUsername('alice')!.id).toBe(u.id)
    expect(findUserById(u.id)!.username).toBe('alice')
  })

  test('username is unique', () => {
    createUser('bob', 'h')
    expect(() => createUser('bob', 'h')).toThrow()
  })

  test('stats + leaderboard', () => {
    const a = createUser('a', 'h')
    const b = createUser('b', 'h')
    addStats(a.id, 3, 1)
    addStats(b.id, 1, 5)
    expect(leaderboard('wins').map(u => u.username)).toEqual(['a', 'b'])
    expect(leaderboard('boxerWins').map(u => u.username)).toEqual(['b', 'a'])
  })

  test('game log aggregates play time and wins within a window', () => {
    const a = createUser('a', 'h')
    const b = createUser('b', 'h')
    const now = Date.now()
    addGameLog(a.id, now, 120, 1, 2)
    addGameLog(a.id, now - 1000, 60, 0, 1)
    addGameLog(b.id, now - 25 * 60 * 60 * 1000, 999, 5, 5) // outside the 24h window
    const m = recentTotals(now - 24 * 60 * 60 * 1000)
    expect(m.get(a.id)).toEqual({ seconds: 180, wins: 1, boxerWins: 3 })
    expect(m.get(b.id)).toBeUndefined()
  })

  test('deleting a user also drops their play log rows', () => {
    const a = createUser('gone', 'h')
    addGameLog(a.id, Date.now(), 300, 2, 1)
    expect(recentTotals(Date.now() - 60_000).get(a.id)).toBeDefined()

    deleteUser(a.id)
    expect(findUserById(a.id)).toBeUndefined()
    // 删号后 24h 台账不能留着——否则统计表和"近24小时"榜会一直背着幽灵数据
    expect(recentTotals(Date.now() - 60_000).get(a.id)).toBeUndefined()
  })

  test('reset + role + delete + countAdmins', () => {
    const a = createUser('a', 'h')
    addStats(a.id, 4, 4)
    resetStats(a.id)
    expect(findUserById(a.id)!.wins).toBe(0)
    setRole(a.id, 'admin')
    expect(findUserById(a.id)!.role).toBe('admin')
    expect(countAdmins()).toBe(1)
    deleteUser(a.id)
    expect(findUserById(a.id)).toBeUndefined()
    expect(listUsers()).toHaveLength(0)
  })
})
