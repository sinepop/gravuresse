import Ic from './icons'
import { t } from '../i18n'

const STATUS_MAP = {
  pending: { color: 'var(--text-muted)' },
  running: { color: 'var(--accent)' },
  completed: { color: 'var(--success)' },
  failed: { color: 'var(--danger)' }
}

export default function TaskQueue({ tasks, onRetry, onRemove, lang }) {
  if (tasks.length === 0) return null
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', maxHeight: 160, overflow: 'auto' }}>
      <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
        {t('taskQueue', lang)} ({tasks.length})
      </div>
      {tasks.map(task => {
        const st = STATUS_MAP[task.status] || STATUS_MAP.pending
        return (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11 }}>
            <span style={{ color: st.color, fontSize: 10, minWidth: 48 }}>{t(task.status, lang)}</span>
            <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.label}</span>
            {task.status === 'running' && (
              <div style={{ width: 60, height: 4, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${task.progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            )}
            {task.status === 'failed' && <button onClick={() => onRetry(task)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 10, cursor: 'pointer' }}><Ic n="refresh" size={10} /> {t('retry', lang)}</button>}
            <button onClick={() => onRemove(task.id)} style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', padding: 2 }}><Ic n="close" size={10} /></button>
          </div>
        )
      })}
    </div>
  )
}
