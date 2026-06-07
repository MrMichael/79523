import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CardSprite from '../../src/components/common/CardSprite.vue'
import { Suit, Rank } from '@79523/engine'

describe('CardSprite', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders rank and suit', () => {
    const card = { suit: Suit.Spade, rank: Rank.Seven }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('♠')
  })

  it('renders Ace correctly', () => {
    const card = { suit: Suit.Heart, rank: Rank.Ace }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('♥')
  })

  it('renders King correctly', () => {
    const card = { suit: Suit.Diamond, rank: Rank.King }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.text()).toContain('K')
    expect(wrapper.text()).toContain('♦')
  })

  it('applies suit-red class for hearts', () => {
    const card = { suit: Suit.Heart, rank: Rank.Five }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.classes()).toContain('suit-red')
  })

  it('applies suit-red class for diamonds', () => {
    const card = { suit: Suit.Diamond, rank: Rank.Nine }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.classes()).toContain('suit-red')
  })

  it('applies suit-black class for spades', () => {
    const card = { suit: Suit.Spade, rank: Rank.Three }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.classes()).toContain('suit-black')
  })

  it('applies suit-black class for clubs', () => {
    const card = { suit: Suit.Club, rank: Rank.Two }
    const wrapper = mount(CardSprite, { props: { card } })
    expect(wrapper.classes()).toContain('suit-black')
  })

  it('applies selected class when selected', () => {
    const card = { suit: Suit.Spade, rank: Rank.Seven }
    const wrapper = mount(CardSprite, { props: { card, selected: true } })
    expect(wrapper.classes()).toContain('selected')
  })

  it('applies dimmed class when dimmed', () => {
    const card = { suit: Suit.Heart, rank: Rank.Four }
    const wrapper = mount(CardSprite, { props: { card, dimmed: true } })
    expect(wrapper.classes()).toContain('dimmed')
  })

  it('emits select event on click', async () => {
    const card = { suit: Suit.Spade, rank: Rank.Ace }
    const wrapper = mount(CardSprite, { props: { card } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('renders all 13 ranks correctly', () => {
    const rankExpects: [Rank, string][] = [
      [Rank.Four, '4'], [Rank.Six, '6'], [Rank.Eight, '8'],
      [Rank.Ten, '10'], [Rank.Jack, 'J'], [Rank.Queen, 'Q'],
      [Rank.King, 'K'], [Rank.Ace, 'A'], [Rank.Three, '3'],
      [Rank.Two, '2'], [Rank.Five, '5'], [Rank.Nine, '9'],
      [Rank.Seven, '7'],
    ]
    for (const [rank, label] of rankExpects) {
      const card = { suit: Suit.Spade, rank }
      const wrapper = mount(CardSprite, { props: { card } })
      expect(wrapper.text()).toContain(label)
      expect(wrapper.text()).toContain('♠')
    }
  })

  it('renders all 4 suits correctly', () => {
    const suitExpects: [Suit, string, string][] = [
      [Suit.Spade, '♠', 'suit-black'],
      [Suit.Heart, '♥', 'suit-red'],
      [Suit.Club, '♣', 'suit-black'],
      [Suit.Diamond, '♦', 'suit-red'],
    ]
    for (const [suit, symbol, cls] of suitExpects) {
      const card = { suit, rank: Rank.Ace }
      const wrapper = mount(CardSprite, { props: { card } })
      expect(wrapper.text()).toContain(symbol)
      expect(wrapper.classes()).toContain(cls)
    }
  })
})
