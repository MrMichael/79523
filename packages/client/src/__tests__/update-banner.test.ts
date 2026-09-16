import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UpdateBanner from '../components/common/UpdateBanner.vue'

const version = (id: string) => vi.fn(async () => ({ ok: true, json: async () => ({ buildId: id }) }))

describe('UpdateBanner (部署后提示刷新)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); globalThis.fetch = originalFetch })

  it('stays hidden while the build id does not change', async () => {
    globalThis.fetch = version('aaa') as any
    const w = mount(UpdateBanner)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.find('.update-banner').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(120_000)
    await w.vm.$nextTick()
    expect(w.find('.update-banner').exists()).toBe(false)
  })

  it('offers a refresh once the server serves a different build', async () => {
    globalThis.fetch = version('aaa') as any
    const w = mount(UpdateBanner)
    await vi.advanceTimersByTimeAsync(0)

    globalThis.fetch = version('bbb') as any // 部署发生了
    await vi.advanceTimersByTimeAsync(60_000)
    await w.vm.$nextTick()

    const banner = w.find('.update-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('有新版本')
  })

  it('does not blow up when the endpoint is missing (vite dev server)', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('404') }) as any
    const w = mount(UpdateBanner)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(w.find('.update-banner').exists()).toBe(false)
  })

  it('reloads the page when tapped', async () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, reload }, writable: true, configurable: true })
    try {
      globalThis.fetch = version('aaa') as any
      const w = mount(UpdateBanner)
      await vi.advanceTimersByTimeAsync(0)
      globalThis.fetch = version('bbb') as any
      await vi.advanceTimersByTimeAsync(60_000)
      await w.vm.$nextTick()
      await w.find('.update-banner').trigger('click')
      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
    }
  })
})
