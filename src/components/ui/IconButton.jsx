// @ts-check

/**
 * Compact icon-only button for toolbars and chrome.
 * @param {{
 *   icon: React.ReactNode,
 *   active?: boolean,
 *   disabled?: boolean,
 *   title?: string,
 *   danger?: boolean,
 *   size?: number,
 *   onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void,
 *   style?: React.CSSProperties
 * }} props
 */
export default function IconButton({ icon, active, disabled, title, danger, size = 28, onClick, style }) {
  /** @type {React.CSSProperties} */
  const base = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'var(--accent-soft)' : 'transparent',
    border: `1px solid ${active ? 'var(--border-accent)' : 'transparent'}`,
    borderRadius: 'var(--radius-sm)',
    color: active ? 'var(--accent)' : danger ? 'var(--danger)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 0,
    opacity: disabled ? 0.45 : 1,
    transition: 'all 0.15s ease',
    ...style
  }

  return (
    <button onClick={onClick} disabled={disabled} title={title} style={base}>
      {icon}
    </button>
  )
}
