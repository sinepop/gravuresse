// @ts-check

/**
 * Lightweight button primitive using project CSS tokens.
 * @param {{
 *   children: React.ReactNode,
 *   variant?: 'primary' | 'ghost' | 'danger',
 *   size?: 'sm' | 'md',
 *   disabled?: boolean,
 *   title?: string,
 *   onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void,
 *   style?: React.CSSProperties,
 *   className?: string
 * }} props
 */
export default function Button({ children, variant = 'ghost', size = 'md', disabled, title, onClick, style, className }) {
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'

  /** @type {React.CSSProperties} */
  const base = {
    padding: size === 'sm' ? '4px 10px' : '8px 16px',
    background: isPrimary
      ? 'var(--accent-gradient)'
      : isDanger
        ? 'var(--danger-soft)'
        : 'var(--bg-surface)',
    border: `1px solid ${isPrimary ? 'transparent' : isDanger ? 'var(--danger-border)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-sm)',
    color: isPrimary ? 'var(--text-white)' : isDanger ? 'var(--danger)' : 'var(--text-secondary)',
    fontSize: size === 'sm' ? 11 : 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-body)',
    fontWeight: isPrimary ? 600 : 400,
    transition: 'all 0.15s ease',
    boxShadow: isPrimary ? 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
    opacity: disabled ? 0.55 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
    ...style
  }

  return (
    <button onClick={onClick} disabled={disabled} title={title} style={base} className={className}>
      {children}
    </button>
  )
}
