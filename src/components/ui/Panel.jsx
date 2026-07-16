// @ts-check

/**
 * Container panel with consistent styling.
 * @param {{
 *   children: React.ReactNode,
 *   variant?: 'default' | 'glass' | 'elevated',
 *   padding?: number | string,
 *   style?: React.CSSProperties,
 *   className?: string
 * }} props
 */
export default function Panel({ children, variant = 'default', padding, style, className }) {
  const variantStyles = {
    default: { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' },
    glass: { background: 'var(--glass-shell)', border: '1px solid var(--border-glass)' },
    elevated: { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }
  }

  /** @type {React.CSSProperties} */
  const base = {
    borderRadius: 'var(--radius-md)',
    padding: padding ?? 16,
    ...variantStyles[variant],
    ...style
  }

  return <div style={base} className={className}>{children}</div>
}
