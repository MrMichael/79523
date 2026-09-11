import { describe, test, expect, beforeEach } from '@jest/globals'
import { initDb, db } from '../db'
import { hashPassword, verifyPassword, signToken, verifyToken, registerUser, authenticate, publicUser } from '../auth'

describe('auth', () => {
  beforeEach(() => { initDb(); db.exec('DELETE FROM users') })

  test('password hash roundtrip', () => {
    const h = hashPassword('secret123')
    expect(h).not.toBe('secret123')
    expect(verifyPassword('secret123', h)).toBe(true)
    expect(verifyPassword('wrong', h)).toBe(false)
  })

  test('token roundtrip', () => {
    const t = signToken({ id: 'u1', role: 'admin' })
    expect(verifyToken(t)).toEqual({ uid: 'u1', role: 'admin' })
    expect(verifyToken('garbage')).toBeNull()
  })

  test('register validation + uniqueness', () => {
    expect(() => registerUser('a', 'secret123')).toThrow()
    expect(() => registerUser('bob', '123')).toThrow()
    registerUser('bob', 'secret123')
    expect(() => registerUser('bob', 'secret123')).toThrow()
  })

  test('accepts Chinese usernames', () => {
    const u = registerUser('小李', 'secret123')
    expect(u.username).toBe('小李')
    expect(authenticate('小李', 'secret123')!.id).toBe(u.id)
  })

  test('authenticate', () => {
    registerUser('bob', 'secret123')
    expect(authenticate('bob', 'secret123')!.username).toBe('bob')
    expect(authenticate('bob', 'nope')).toBeNull()
    expect(authenticate('ghost', 'secret123')).toBeNull()
  })

  test('publicUser hides hash', () => {
    const u = registerUser('bob', 'secret123')
    const p = publicUser(u, true)
    expect(p).not.toHaveProperty('password_hash')
    expect(p).toMatchObject({ username: 'bob', online: true })
  })
})
