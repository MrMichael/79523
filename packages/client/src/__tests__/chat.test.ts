import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'

const { fakeSocket } = vi.hoisted(() => {
  const fakeSocket = { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), off: vi.fn(), connected: true }
  return { fakeSocket }
})
vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket), Socket: class {} }))
vi.mock('../../src/api', () => ({ getToken: vi.fn(() => 'T'), setToken: vi.fn(), apiFetch: vi.fn() }))

import { useSocket } from '../../src/composables/useSocket'
import { useGameStore } from '../../src/stores/game'
import ChatPanel from '../../src/components/game/ChatPanel.vue'
import PlayerSlot from '../../src/components/game/PlayerSlot.vue'
import { CHAT_PHRASES, CHAT_MAX_CHARS } from '../../src/chatPhrases'

const msg = (over: Record<string, unknown> = {}) => ({ playerId: 'p1', name: '甲', text: '好啵', at: 1, ...over })

describe('chat store', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('appends a message, shows a bubble above the speaker, then expires it', () => {
    vi.useFakeTimers()
    const s = useGameStore()
    s.addChat(msg())
    expect(s.chatMessages).toHaveLength(1)
    expect(s.chatBubbles.p1).toBe('好啵')
    vi.advanceTimersByTime(3000)
    expect(s.chatBubbles.p1).toBeUndefined()
    vi.useRealTimers()
  })

  it('refreshes (does not shorten) the bubble when the same player talks again', () => {
    vi.useFakeTimers()
    const s = useGameStore()
    s.addChat(msg())
    vi.advanceTimersByTime(2000)
    s.addChat(msg({ text: '拜拜' }))
    expect(s.chatBubbles.p1).toBe('拜拜')
    vi.advanceTimersByTime(2000) // the first timer would have expired here
    expect(s.chatBubbles.p1).toBe('拜拜')
    vi.advanceTimersByTime(1000)
    expect(s.chatBubbles.p1).toBeUndefined()
    vi.useRealTimers()
  })

  it('caps the log at 50 and counts unread only while the panel is closed', () => {
    const s = useGameStore()
    for (let i = 0; i < 60; i++) s.addChat(msg({ text: `t${i}` }))
    expect(s.chatMessages).toHaveLength(50)
    expect(s.chatMessages[49].text).toBe('t59')
    expect(s.chatUnread).toBe(60)
    s.openChat()
    expect(s.chatUnread).toBe(0)
    s.addChat(msg())
    expect(s.chatUnread).toBe(0)
    s.clearChat()
    expect(s.chatMessages).toHaveLength(0)
    expect(s.chatBubbles.p1).toBeUndefined()
  })
})

describe('ChatPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useSocket().connect()
  })

  it('renders the preset phrases and sends one when clicked', async () => {
    const w = mount(ChatPanel)
    await w.find('.chat-fab').trigger('click')
    const buttons = w.findAll('.quick-btn')
    expect(buttons.map(b => b.text())).toEqual([...CHAT_PHRASES])
    await buttons[0].trigger('click')
    expect(fakeSocket.emit).toHaveBeenCalledWith('chat', { text: CHAT_PHRASES[0] })
  })

  it('sends trimmed free text and clears the box', async () => {
    const w = mount(ChatPanel)
    await w.find('.chat-fab').trigger('click')
    const input = w.find('.chat-input')
    await input.setValue('  拜拜  ')
    await w.find('.chat-form').trigger('submit')
    expect(fakeSocket.emit).toHaveBeenCalledWith('chat', { text: '拜拜' })
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('caps free text at the server limit and blocks empty sends', async () => {
    const w = mount(ChatPanel)
    await w.find('.chat-fab').trigger('click')
    expect(w.find('.chat-input').attributes('maxlength')).toBe(String(CHAT_MAX_CHARS))
    expect(w.find('.chat-send').attributes('disabled')).toBeDefined()
    await w.find('.chat-input').setValue('好')
    expect(w.find('.chat-send').attributes('disabled')).toBeUndefined()
  })

  it('shows the unread badge while closed and clears it on open', async () => {
    const s = useGameStore()
    const w = mount(ChatPanel)
    s.addChat(msg({ at: 2 }))
    await w.vm.$nextTick()
    expect(w.find('.fab-dot').text()).toBe('1')
    await w.find('.chat-fab').trigger('click')
    expect(w.find('.fab-dot').exists()).toBe(false)
    expect(s.chatUnread).toBe(0)
  })

  it('renders the room chat log', async () => {
    const s = useGameStore()
    const w = mount(ChatPanel)
    await w.find('.chat-fab').trigger('click')
    s.addChat(msg({ text: '爽雕啷🌊' }))
    await w.vm.$nextTick()
    const line = w.find('.chat-line')
    expect(line.text()).toContain('甲')
    expect(line.text()).toContain('爽雕啷🌊')
  })
})

describe('PlayerSlot quick-chat bubble', () => {
  it('renders the bubble above the speaker', () => {
    const w = mount(PlayerSlot, { props: { name: '甲', cardCount: 3, score: 0, isActive: false, bubble: '快啲出牌' } })
    expect(w.find('.bubble').text()).toBe('快啲出牌')
  })

  it('renders no bubble when silent', () => {
    const w = mount(PlayerSlot, { props: { name: '甲', cardCount: 3, score: 0, isActive: false } })
    expect(w.find('.bubble').exists()).toBe(false)
  })
})
