import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SfxName } from '../audio'

/** Minimal stand-in for WebAudio, counting the nodes the synth asks for. */
function installMockAudioContext() {
  const state = { oscillators: 0, noises: 0, gains: [] as { gain: { value: number } }[] }
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  })
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
  ;(window as any).AudioContext = class {
    currentTime = 0
    sampleRate = 44100
    state = 'running'
    destination = node()
    resume = vi.fn(async () => {})
    createGain() { const g = { ...node(), gain: param() }; state.gains.push(g); return g }
    createOscillator() { state.oscillators++; return { ...node(), type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn() } }
    createBiquadFilter() { return { ...node(), type: 'bandpass', Q: { value: 0 }, frequency: param() } }
    createBuffer(_ch: number, len: number) { state.noises++; return { getChannelData: () => new Float32Array(len) } }
    createBufferSource() { return { ...node(), buffer: null, start: vi.fn(), stop: vi.fn() } }
  }
  return state
}

const ALL_SFX: SfxName[] = [
  'yourTurn', 'play', 'pass', 'score', 'boxerPunch',
  'boxerOut', 'boxerChampion', 'gameWin', 'gameLose', 'chat',
]

describe('audio engine', () => {
  beforeEach(() => {
    vi.resetModules() // fresh module (and fresh AudioContext) per test
    localStorage.clear()
    delete (window as any).AudioContext
  })

  it('stays silent — and does not throw — before the first user gesture', async () => {
    const { play } = await import('../audio')
    expect(() => play('play')).not.toThrow()
  })

  it('does not throw when the browser has no AudioContext at all', async () => {
    const mod = await import('../audio')
    expect(() => { mod.unlockAudio(); mod.play('boxerPunch') }).not.toThrow()
  })

  it('synthesises a sound once unlocked', async () => {
    const m = installMockAudioContext()
    const { unlockAudio, play } = await import('../audio')
    unlockAudio()
    play('play')            // noise burst
    expect(m.noises).toBe(1)
    play('yourTurn')        // three tones
    expect(m.oscillators).toBe(3)
  })

  it('can synthesise every named sound', async () => {
    const m = installMockAudioContext()
    const mod = await import('../audio')
    mod.unlockAudio()
    for (const name of ALL_SFX) {
      const before = m.oscillators + m.noises
      mod.play(name)
      expect(m.oscillators + m.noises).toBeGreaterThan(before)
    }
  })

  it('puts the volume on the master gain and goes to 0 when muted', async () => {
    const m = installMockAudioContext()
    const mod = await import('../audio')
    mod.unlockAudio()
    mod.setVolume(0.4)
    expect(m.gains[0].gain.value).toBeCloseTo(0.4)
    mod.setMuted(true)
    expect(m.gains[0].gain.value).toBe(0)
    // ...and muted really means no nodes are created.
    mod.play('yourTurn')
    expect(m.oscillators).toBe(0)
  })

  it('clamps the volume and persists both settings', async () => {
    const mod = await import('../audio')
    mod.setVolume(2)
    expect(mod.volume.value).toBe(1)
    mod.setVolume(-1)
    expect(mod.volume.value).toBe(0)
    mod.setVolume(0.25)
    mod.setMuted(true)
    expect(localStorage.getItem('sfx.volume')).toBe('0.25')
    expect(localStorage.getItem('sfx.muted')).toBe('1')
  })

  it('restores the settings from localStorage', async () => {
    localStorage.setItem('sfx.volume', '0.25')
    localStorage.setItem('sfx.muted', '1')
    const mod = await import('../audio')
    mod.loadAudioSettings()
    expect(mod.volume.value).toBeCloseTo(0.25)
    expect(mod.muted.value).toBe(true)
  })

  it('arms on the first gesture anywhere', async () => {
    const m = installMockAudioContext()
    const mod = await import('../audio')
    mod.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    mod.play('score')
    expect(m.oscillators).toBeGreaterThan(0)
  })
})
