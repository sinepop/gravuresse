// @ts-check

import Pill from './Pill'

/**
 * Status dot + optional label, using existing status color conventions.
 * @param {{
 *   status: string,
 *   label?: string,
 *   size?: 'sm' | 'md'
 * }} props
 */
export default function StatusBadge({ status, label, size = 'sm' }) {
  /** @type {Record<string, string>} */
  const colorMap = {
    verified: 'var(--success)',
    connected: 'var(--accent)',
    active: 'var(--success)',
    ready: 'var(--success)',
    pending: 'var(--warning)',
    saving: 'var(--warning)',
    error: 'var(--danger)',
    disconnected: 'var(--text-muted)'
  }
  const color = colorMap[status] || 'var(--text-muted)'
  const dotSize = size === 'sm' ? 6 : 8

  return (
    <Pill variant={status === 'error' ? 'danger' : status === 'ready' || status === 'active' ? 'success' : 'default'} size={size}>
      <span style={{
        width: dotSize, height: dotSize, borderRadius: '50%',
        background: color, flexShrink: 0
      }} />
      {label}
    </Pill>
  )
}
