import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { Suit, Rank } from '@79523/engine'

// Capture the socket handlers SurrenderOverlay registers so we can drive the mounted component.
const { fakeSocket, handlers } = vi.hoisted(() => {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {}
  const fakeSocket = {
    on: vi.fn((evt: string, fn: (...args: any[]) => void) => { (handlers[evt] ||= []).push(fn) }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    off: vi.fn(),
  }
  return { fakeSocket, handlers }
})

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket), Socket: class {} }))

import { useSocket } from '../../src/composables/useSocket'
import SurrenderOverlay from '../../src/components/game/SurrenderOverlay.vue'

const fire = (evt: string, payload?: any) => {
  for (const fn of handlers[evt] || []) fn(payload)
}
const c = (suit: Suit, rank: Rank) => ({ suit, rank })

describe('SurrenderOverlay (mounted)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
    useSocket().connect()
  })

  it('loser: highlights only the largest card and emits surrender_give', async () => {
    const wrapper = mount(SurrenderOverlay)
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Five)]
    fire('surrender_start', { phase: 'losers_give', yourRole: 'loser', hand, info: '请选择最大单张' })
    await nextTick()

    expect(wrapper.find('.surrender-overlay').exists()).toBe(true)
    const cards = wrapper.findAll('.card-grid .card')
    expect(cards).toHaveLength(3)

    // Seven (index 1) is the largest single → only it is not dimmed
    expect(cards[1].classes()).not.toContain('dimmed')
    expect(cards[0].classes()).toContain('dimmed')
    expect(cards[2].classes()).toContain('dimmed')

    await cards[1].trigger('click')
    expect(wrapper.findAll('.card.selected')).toHaveLength(1)

    await wrapper.find('.action-btn').trigger('click')
    expect(fakeSocket.emit).toHaveBeenCalledWith('surrender_give', { card: hand[1] })
  })

  it('loser: cannot select a non-largest card', async () => {
    const wrapper = mount(SurrenderOverlay)
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Spade, Rank.Seven)]
    fire('surrender_start', { phase: 'losers_give', yourRole: 'loser', hand, info: '' })
    await nextTick()

    await wrapper.findAll('.card-grid .card')[0].trigger('click') // Four, not largest
    expect(wrapper.findAll('.card.selected')).toHaveLength(0)
    expect(wrapper.find('.action-btn').attributes('disabled')).toBeDefined()
  })

  it('winner: picks from the surrendered cards and emits surrender_pick', async () => {
    const wrapper = mount(SurrenderOverlay)
    const surrendered = [{ playerId: 'p2', playerName: '乙', card: c(Suit.Heart, Rank.King) }]
    fire('surrender_start', { phase: 'winners_pick', yourRole: 'winner', hand: [], info: '挑一张', surrenderedCards: surrendered })
    await nextTick()

    const cards = wrapper.findAll('.card-grid .card')
    expect(cards).toHaveLength(1)
    await cards[0].trigger('click')
    await wrapper.find('.action-btn').trigger('click')
    expect(fakeSocket.emit).toHaveBeenCalledWith('surrender_pick', { card: surrendered[0].card })
  })

  it('winner: returns a card and emits surrender_return', async () => {
    const wrapper = mount(SurrenderOverlay)
    const hand = [c(Suit.Club, Rank.Two), c(Suit.Diamond, Rank.Four)]
    fire('surrender_start', { phase: 'winners_return', yourRole: 'winner', hand, info: '还一张' })
    await nextTick()

    await wrapper.findAll('.card-grid .card')[0].trigger('click')
    await wrapper.find('.action-btn').trigger('click')
    expect(fakeSocket.emit).toHaveBeenCalledWith('surrender_return', { card: hand[0] })
  })

  it('spectator: sees no actionable controls', async () => {
    const wrapper = mount(SurrenderOverlay)
    fire('surrender_start', { phase: 'losers_give', yourRole: 'spectator', hand: [c(Suit.Spade, Rank.Four)], info: '等待中' })
    await nextTick()

    expect(wrapper.find('.surrender-overlay').exists()).toBe(true)
    expect(wrapper.find('.action-btn').exists()).toBe(false)
    expect(wrapper.find('.card-grid').exists()).toBe(false)
  })

  it('hides the overlay on next_game_lead', async () => {
    const wrapper = mount(SurrenderOverlay)
    fire('surrender_start', { phase: 'losers_give', yourRole: 'loser', hand: [c(Suit.Spade, Rank.Four)], info: '' })
    await nextTick()
    expect(wrapper.find('.surrender-overlay').exists()).toBe(true)

    fire('next_game_lead', {})
    await nextTick()
    expect(wrapper.find('.surrender-overlay').exists()).toBe(false)
  })
})
