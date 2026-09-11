import { describe, test, expect, beforeEach } from '@jest/globals'
import { initDb, db, createUser, findUserById } from '../db'
import { persistGameStats } from '../stats'

describe('persistGameStats', () => {
  beforeEach(() => { initDb(); db.exec('DELETE FROM users') })

  test('adds wins to first place and boxerWins to champions', () => {
    const a = createUser('a', 'h')
    const b = createUser('b', 'h')
    persistGameStats([
      { id: a.id, rank1: true, boxerWins: 2 },
      { id: b.id, rank1: false, boxerWins: 0 },
    ])
    expect(findUserById(a.id)).toMatchObject({ wins: 1, boxer_wins: 2 })
    expect(findUserById(b.id)).toMatchObject({ wins: 0, boxer_wins: 0 })
  })

  test('skips ids that are not accounts (AI)', () => {
    const a = createUser('a', 'h')
    persistGameStats([
      { id: a.id, rank1: true, boxerWins: 0 },
      { id: 'ai-1-xyz', rank1: false, boxerWins: 5 },
    ])
    expect(findUserById(a.id)!.wins).toBe(1)
    expect(findUserById('ai-1-xyz')).toBeUndefined()
  })
})
