import { describe, test, expect, beforeEach } from '@jest/globals'
import { initDb, db, createUser, findUserByUsername, findUserById, listUsers, deleteUser, setRole, resetStats, addStats, leaderboard, countAdmins } from '../db'

describe('db layer', () => {
  beforeEach(() => {
    initDb()
    db.exec('DELETE FROM users')
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
