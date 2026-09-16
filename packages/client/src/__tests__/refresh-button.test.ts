import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RefreshButton from '../components/common/RefreshButton.vue'

describe('RefreshButton', () => {
  const original = window.location
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })

  it('reloads the page when tapped', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...original, reload }, writable: true, configurable: true })
    const w = mount(RefreshButton)
    await w.find('.refresh-btn').trigger('click')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
