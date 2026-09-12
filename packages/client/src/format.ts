/** Human-readable duration: N秒 / N分 / N小时M分. */
export function formatDuration(sec = 0): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}分`
  return `${Math.floor(m / 60)}小时${m % 60}分`
}
