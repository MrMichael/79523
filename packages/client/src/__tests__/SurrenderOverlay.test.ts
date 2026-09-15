import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { Suit, Rank } from '@79523/engine'

const { fakeSocket } = vi.hoisted(() => {
  const fakeSocket = { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), off: vi.fn() }
  return { fakeSocket }
})

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket), Socket: class {} }))

import { useSocket } from '../../src/composables/useSocket'
import { useGameStore } from '../../src/stores/game'
import SurrenderOverlay from '../../src/components/game/SurrenderOverlay.vue'

const c = (suit: Suit, rank: Rank) => ({ suit, rank })

// The overlay is a pure view over the store (useGame drives it from socket events), so the
// tests set the store directly. That also means it survives a reconnect/reload.
describe('SurrenderOverlay (mounted)', () => {
  let store: ReturnType<typeof useGameStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useSocket().connect()
    store = useGameStore()
  })

  function show(phase: 'losers_give' | 'winners_pick' | 'winners_return', role: 'loser' | 'winner' | 'spectator', hand: any[] = [], extra: { info?: string; surrenderedCards?: any[] } = {}) {
    store.surrenderActive = true
    store.surrenderPhase = phase
    store.surrenderRole = role
    store.surrenderHand = hand
    store.surrenderInfo = extra.info || ''
    store.surrenderPickCards = extra.surrenderedCards || []
  }

  it('loser: highlights only the largest card and emits surrender_give', async () => {
    const wrapper = mount(SurrenderOverlay)
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Five)]
    show('losers_give', 'loser', hand, { info: '请选择最大单张' })
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
    show('losers_give', 'loser', hand)
    await nextTick()

    await wrapper.findAll('.card-grid .card')[0].trigger('click') // Four, not largest
    expect(wrapper.findAll('.card.selected')).toHaveLength(0)
    expect(wrapper.find('.action-btn').attributes('disabled')).toBeDefined()
  })

  it('winner: picks from the surrendered cards and emits surrender_pick', async () => {
    const wrapper = mount(SurrenderOverlay)
    const surrendered = [{ playerId: 'p2', playerName: '乙', card: c(Suit.Heart, Rank.King) }]
    show('winners_pick', 'winner', [], { info: '挑一张', surrenderedCards: surrendered })
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
    show('winners_return', 'winner', hand, { info: '还一张' })
    await nextTick()

    await wrapper.findAll('.card-grid .card')[0].trigger('click')
    await wrapper.find('.action-btn').trigger('click')
    expect(fakeSocket.emit).toHaveBeenCalledWith('surrender_return', { card: hand[0] })
  })

  it('spectator: sees no actionable controls', async () => {
    const wrapper = mount(SurrenderOverlay)
    show('losers_give', 'spectator', [c(Suit.Spade, Rank.Four)], { info: '等待中' })
    await nextTick()

    expect(wrapper.find('.surrender-overlay').exists()).toBe(true)
    expect(wrapper.find('.action-btn').exists()).toBe(false)
    expect(wrapper.find('.card-grid').exists()).toBe(false)
  })

  it('shows the tribute result (gave → received) once it completes', async () => {
    const w = mount(SurrenderOverlay, { props: { playerNames: { p2: '乙' } } })
    store.surrenderActive = true
    store.surrenderResult = [{ id: 'p2', gaveUpCard: c(Suit.Spade, Rank.Nine), receivedCard: c(Suit.Heart, Rank.Four) }]
    await nextTick()

    expect(w.find('.result-title').text()).toContain('交粮完成')
    expect(w.find('.result-row').text()).toContain('乙')
    // Two cards are shown for the swap (gave + received).
    expect(w.find('.result-row').findAll('.card').length).toBe(2)
  })

  it('hides when the store clears the surrender state', async () => {
    const wrapper = mount(SurrenderOverlay)
    show('losers_give', 'loser', [c(Suit.Spade, Rank.Four)])
    await nextTick()
    expect(wrapper.find('.surrender-overlay').exists()).toBe(true)

    store.surrenderActive = false
    await nextTick()
    expect(wrapper.find('.surrender-overlay').exists()).toBe(false)
  })
})
