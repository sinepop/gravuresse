// @ts-check

/**
 * Section header with optional action area.
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   action?: React.ReactNode,
 *   style?: React.CSSProperties
 * }} props
 */
export default function SectionHeader({ title, subtitle, action, style }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      ...style
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.2px'
        }}>{title}</span>
        {subtitle && (
          <span style={{
            color: 'var(--text-muted)',
            fontSize: 'var(--font-size-meta)'
          }}>{subtitle}</span>
        )}
      </div>
      {action}
    </div>
  )
}
