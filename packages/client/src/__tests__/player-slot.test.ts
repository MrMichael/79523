import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerSlot from '../components/game/PlayerSlot.vue'
import TurnIndicator from '../components/game/TurnIndicator.vue'

describe('PlayerSlot (in-game player)', () => {
  const base = { name: '甲', cardCount: 3, score: 10, isActive: false }

  it('shows a 托管 badge and dims when the player is disconnected', () => {
    const w = mount(PlayerSlot, { props: { ...base, connected: false } })
    expect(w.classes()).toContain('offline')
    expect(w.find('.offline-badge').text()).toContain('托管')
    expect(w.find('.cards-face-down').classes()).toContain('dim')
  })

  it('has no offline marker when connected', () => {
    const w = mount(PlayerSlot, { props: { ...base, connected: true } })
    expect(w.classes()).not.toContain('offline')
    expect(w.find('.offline-badge').exists()).toBe(false)
  })
})

describe('TurnIndicator managed hint', () => {
  it('says the absent player is auto-managed', () => {
    const w = mount(TurnIndicator, { props: { isMyTurn: false, currentPlayer: '甲', timeLeft: 30, currentPlayerOffline: true } })
    const label = w.find('.turn-label')
    expect(label.text()).toContain('托管中')
    expect(label.classes()).toContain('managed')
  })

  it('falls back to the normal waiting text when online', () => {
    const w = mount(TurnIndicator, { props: { isMyTurn: false, currentPlayer: '甲', timeLeft: 30 } })
    expect(w.find('.turn-label').text()).toContain('等待 甲 出牌')
  })
})
