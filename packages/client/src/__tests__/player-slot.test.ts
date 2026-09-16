import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerSlot from '../components/game/PlayerSlot.vue'
import TurnIndicator from '../components/game/TurnIndicator.vue'

describe('PlayerSlot (in-game player)', () => {
  const base = { name: '甲', cardCount: 3, score: 10, isActive: false }

  it('marks a disconnected seat as offline (托管) and dims it', () => {
    const w = mount(PlayerSlot, { props: { ...base, connected: false } })
    expect(w.classes()).toContain('offline')
    expect(w.find('.offline-badge').text()).toContain('托管')
    expect(w.find('.cards-face-down').classes()).toContain('dim')
  })

  it('shows the 托管 badge for a player who turned it on themselves', () => {
    const w = mount(PlayerSlot, { props: { ...base, connected: true, managed: true } })
    expect(w.find('.offline-badge').text()).toContain('托管')
    // 在线但托管：不应该被当成掉线（不加 offline 类）
    expect(w.classes()).not.toContain('offline')
  })

  it('shows no badge for an ordinary connected player', () => {
    const w = mount(PlayerSlot, { props: { ...base, connected: true } })
    expect(w.find('.offline-badge').exists()).toBe(false)
    expect(w.classes()).not.toContain('offline')
  })
})

describe('TurnIndicator managed hint', () => {
  it('says the absent player is auto-managed', () => {
    const w = mount(TurnIndicator, { props: { isMyTurn: false, currentPlayer: '甲', timeLeft: 30, currentPlayerAuto: true } })
    const label = w.find('.turn-label')
    expect(label.text()).toContain('托管中')
    expect(label.classes()).toContain('managed')
  })

  it('falls back to the normal waiting text when online', () => {
    const w = mount(TurnIndicator, { props: { isMyTurn: false, currentPlayer: '甲', timeLeft: 30 } })
    expect(w.find('.turn-label').text()).toContain('等待 甲 出牌')
  })
})
