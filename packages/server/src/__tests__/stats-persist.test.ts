import { describe, test, expect, beforeEach } from '@jest/globals'
import { initDb, db, createUser, findUserById, recentTotals } from '../db'
import { persistGameStats } from '../stats'

describe('persistGameStats', () => {
  beforeEach(() => { initDb(); db.exec('DELETE FROM users'); db.exec('DELETE FROM play_log') })

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

  test('records play time and wins for accounts only', () => {
    const a = createUser('a', 'h')
    persistGameStats([
      { id: a.id, rank1: true, boxerWins: 2, playSeconds: 300 },
      { id: 'ai-1-xyz', rank1: true, boxerWins: 2, playSeconds: 300 },
    ])
    const m = recentTotals(Date.now() - 60_000)
    expect(m.get(a.id)).toEqual({ seconds: 300, wins: 1, boxerWins: 2 })
    expect(m.get('ai-1-xyz')).toBeUndefined()
  })
})
