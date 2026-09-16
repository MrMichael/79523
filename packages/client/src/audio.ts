import { ref } from 'vue'

/**
 * Tiny WebAudio sound engine for game feedback. Everything is synthesised at runtime, so there
 * are no audio files to ship and nothing to load. Browsers refuse to start audio before a user
 * gesture, so the AudioContext is created lazily on the first interaction
 * (`installAudioUnlock`); until then `play` silently does nothing.
 */

export type SfxName =
  | 'yourTurn'
  | 'play'
  | 'pass'
  | 'score'
  | 'boxerPunch'
  | 'boxerOut'
  | 'boxerChampion'
  | 'gameWin'
  | 'gameLose'
  | 'chat'

const VOLUME_KEY = 'sfx.volume'
const MUTED_KEY = 'sfx.muted'
const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

export const muted = ref(false)
export const volume = ref(0.6)

let ctx: AudioContext | null = null
let master: GainNode | null = null

export function loadAudioSettings(): void {
  try {
    muted.value = localStorage.getItem(MUTED_KEY) === '1'
    const v = Number(localStorage.getItem(VOLUME_KEY))
    if (Number.isFinite(v) && v >= 0 && v <= 1) volume.value = v
  } catch {
    // private mode / storage disabled — keep the defaults
  }
}

function persist(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function setMuted(value: boolean): void {
  muted.value = value
  persist(MUTED_KEY, value ? '1' : '0')
  applyGain()
}

export function setVolume(value: number): void {
  volume.value = Math.min(1, Math.max(0, value))
  persist(VOLUME_KEY, String(volume.value))
  applyGain()
}

function applyGain(): void {
  if (master) master.gain.value = muted.value ? 0 : volume.value
}

/** Create the audio context. Must happen inside a user gesture (browser autoplay policy). */
export function unlockAudio(): void {
  if (ctx) return
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    applyGain()
    master.connect(ctx.destination)
  } catch {
    ctx = null
    master = null
  }
}

/** Arm the audio on the first tap/click/key anywhere. */
export function installAudioUnlock(): void {
  const unlock = () => {
    for (const evt of GESTURES) window.removeEventListener(evt, unlock)
    unlockAudio()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }
  for (const evt of GESTURES) window.addEventListener(evt, unlock, { passive: true })
}

interface ToneOpts {
  freq: number
  at?: number
  dur?: number
  gain?: number
  type?: OscillatorType
  sweepTo?: number
}

/** A short enveloped tone. */
function tone(
  c: AudioContext,
  out: AudioNode,
  { freq, at = 0, dur = 0.15, gain = 0.3, type = 'sine', sweepTo }: ToneOpts,
): void {
  const t0 = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(out)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** A filtered noise burst — used for the card "swoosh" and impacts. */
function noise(
  c: AudioContext,
  out: AudioNode,
  { at = 0, dur = 0.2, gain = 0.3, from = 4000, to = 800 },
): void {
  const t0 = c.currentTime + at
  const frames = Math.max(1, Math.floor(c.sampleRate * dur))
  const buffer = c.createBuffer(1, frames, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1

  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(from, t0)
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  src.connect(filter)
  filter.connect(g)
  g.connect(out)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

/** A quick ascending/descending figure. */
const arp = (notes: number[], step: number, dur: number, gain: number, type: OscillatorType) =>
  (c: AudioContext, out: AudioNode) => {
    notes.forEach((f, i) => tone(c, out, { freq: f, at: i * step, dur, gain, type }))
  }

const SFX: Record<SfxName, (c: AudioContext, out: AudioNode) => void> = {
  /** Your turn — the one that has to cut through on a phone. */
  yourTurn: arp([659, 880, 1175], 0.1, 0.16, 0.32, 'triangle'),
  /** A card leaving a hand. */
  play: (c, out) => noise(c, out, { dur: 0.16, gain: 0.3, from: 5200, to: 900 }),
  pass: (c, out) => tone(c, out, { freq: 240, sweepTo: 150, dur: 0.14, gain: 0.25 }),
  score: arp([1047, 1568], 0.08, 0.2, 0.26, 'square'),
  boxerPunch: (c, out) => {
    tone(c, out, { freq: 160, sweepTo: 55, dur: 0.22, gain: 0.45 })
    noise(c, out, { dur: 0.12, gain: 0.25, from: 1600, to: 300 })
  },
  boxerOut: (c, out) => tone(c, out, { freq: 440, sweepTo: 110, dur: 0.45, gain: 0.3, type: 'sawtooth' }),
  boxerChampion: arp([523, 659, 784, 1047], 0.11, 0.3, 0.28, 'triangle'),
  gameWin: arp([523, 659, 784, 1047, 1319], 0.1, 0.4, 0.28, 'triangle'),
  gameLose: arp([523, 415, 330, 262], 0.13, 0.45, 0.26, 'sine'),
  chat: arp([880, 1320], 0.06, 0.1, 0.2, 'sine'),
}

export function play(name: SfxName): void {
  if (muted.value || !ctx || !master) return
  if (ctx.state === 'suspended') void ctx.resume()
  try {
    SFX[name](ctx, master)
  } catch {
    // Audio must never break the game.
  }
}
