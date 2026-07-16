// @ts-check

/**
 * Small pill/chip for tags, status indicators, metadata.
 * @param {{
 *   children: React.ReactNode,
 *   variant?: 'default' | 'active' | 'success' | 'danger' | 'muted',
 *   size?: 'sm' | 'md',
 *   style?: React.CSSProperties
 * }} props
 */
export default function Pill({ children, variant = 'default', size = 'sm', style }) {
  const colorMap = {
    default: 'var(--text-secondary)',
    active: 'var(--accent)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    muted: 'var(--text-muted)'
  }
  const bgMap = {
    default: 'var(--bg-surface)',
    active: 'var(--accent-soft)',
    success: 'var(--success-soft)',
    danger: 'var(--danger-soft)',
    muted: 'var(--bg-surface)'
  }
  const borderMap = {
    default: 'var(--border-subtle)',
    active: 'var(--border-accent)',
    success: 'var(--success-soft)',
    danger: 'var(--danger-border)',
    muted: 'var(--border-subtle)'
  }

  /** @type {React.CSSProperties} */
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: size === 'sm' ? '2px 7px' : '4px 10px',
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${borderMap[variant]}`,
    background: bgMap[variant],
    color: colorMap[variant],
    fontSize: size === 'sm' ? 'var(--font-size-meta)' : 'var(--font-size-sm)',
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    ...style
  }

  return <span style={base}>{children}</span>
}
