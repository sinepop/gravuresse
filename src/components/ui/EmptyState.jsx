// @ts-check

import Ic from '../icons'

/** @typedef {Parameters<typeof Ic>[0]['n']} IconName */

/**
 * Centered empty state with icon, title, and optional description/action.
 * @param {{
 *   icon?: IconName,
 *   title: string,
 *   description?: string,
 *   action?: React.ReactNode,
 *   style?: React.CSSProperties
 * }} props
 */
export default function EmptyState({ icon, title, description, action, style }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 48,
      color: 'var(--text-muted)',
      textAlign: 'center',
      ...style
    }}>
      {icon && (
        <div style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <Ic n={icon} size={22} color="var(--text-muted)" />
        </div>
      )}
      <div>
        <div style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-size-lg)',
          fontWeight: 600,
          marginBottom: 4
        }}>{title}</div>
        {description && (
          <div style={{
            color: 'var(--text-muted)',
            fontSize: 'var(--font-size-sm)',
            maxWidth: 320
          }}>{description}</div>
        )}
      </div>
      {action}
    </div>
  )
}
