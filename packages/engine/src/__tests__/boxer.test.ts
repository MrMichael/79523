import { describe, it, expect } from 'vitest'
import { resolveRound, getWinner } from '../boxer'
import { BoxerMove } from '../types'

describe('resolveRound', () => {
  it('rock beats scissors', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Rock],['p2',BoxerMove.Scissors]]))).toEqual(['p1'])
  })
  it('scissors beats paper', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Scissors],['p2',BoxerMove.Paper]]))).toEqual(['p1'])
  })
  it('paper beats rock', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Paper],['p2',BoxerMove.Rock]]))).toEqual(['p1'])
  })
  it('same move: both survive', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Rock],['p2',BoxerMove.Rock]]))).toEqual(['p1','p2'])
  })
  it('three players: winning move survives', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Rock],['p2',BoxerMove.Scissors],['p3',BoxerMove.Rock]])).sort()).toEqual(['p1','p3'].sort())
  })
  it('all three moves: all survive', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Rock],['p2',BoxerMove.Paper],['p3',BoxerMove.Scissors]])).sort()).toEqual(['p1','p2','p3'].sort())
  })
  it('single player: auto survives', () => {
    expect(resolveRound(new Map([['p1',BoxerMove.Rock]]))).toEqual(['p1'])
  })
})

describe('getWinner', () => {
  it('returns the only survivor', () => expect(getWinner(['p1'])).toBe('p1'))
  it('throws on multiple', () => expect(() => getWinner(['p1','p2'])).toThrow())
  it('throws on empty', () => expect(() => getWinner([])).toThrow())
})
