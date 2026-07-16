// @ts-check

/**
 * Segmented control: a row of options, exactly one selected.
 * @param {{
 *   options: { value: string, label: string, description?: string }[],
 *   value: string,
 *   onChange: (value: string) => void,
 *   disabled?: boolean,
 *   style?: React.CSSProperties
 * }} props
 */
export default function SegmentedControl({ options, value, onChange, disabled, style }) {
  return (
    <div style={{
      display: 'inline-flex',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-default)',
      background: 'var(--bg-surface)',
      overflow: 'hidden',
      opacity: disabled ? 0.55 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      ...style
    }}>
      {options.map((option, index) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.description}
            style={{
              padding: '6px 14px',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              border: 'none',
              borderRight: index < options.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
