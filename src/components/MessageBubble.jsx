import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Ic from './icons'

function ElapsedTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) return
    const update = () => setElapsed(Math.floor((Date.now() - startTime) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startTime])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
      {m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`}
    </span>
  )
}

function TaskCard({ task, onConfirm, onBatchGenerate, lang }) {
  const [batchCount, setBatchCount] = useState(2)
  const [showBatch, setShowBatch] = useState(false)
  const isPending = task.status === 'pending'
  const isGenerating = task.status === 'generating'
  const isDone = task.status === 'done'
  const isError = task.status === 'error'

  return (
    <div style={{
      marginTop: 10, padding: 12, borderRadius: 'var(--radius-md)',
      background: 'var(--bg-primary)',
      border: `1px solid ${isError ? 'var(--danger)' : isDone ? 'var(--success)' : 'var(--border-accent)'}`,
      animation: 'fadeUp 0.3s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ic n={task.type === 'video' ? 'film' : 'image'} size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{task.label}</span>
        {isDone && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Ic n="check" size={11} color="var(--success)" />
            {lang === 'en' ? 'Done' : '已生成'}
            {task.elapsed != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>{task.elapsed}s</span>}
            {task.batchTotal > 1 && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({task.batchDone}/{task.batchTotal})</span>}
          </span>
        )}
        {isError && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--danger)' }}>{lang === 'en' ? 'Failed' : '失败'}</span>}
      </div>
      <div style={{
        fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)',
        background: 'var(--bg-surface)', padding: 8, borderRadius: 'var(--radius-sm)',
        maxHeight: 120, overflow: 'auto', wordBreak: 'break-word', fontFamily: 'var(--font-mono)'
      }}>
        {task.prompt}
      </div>
      {isError && task.error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>{task.error}</div>
      )}
      {isPending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={onConfirm} style={{
            padding: '7px 20px', background: 'var(--accent)', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#FFF', fontSize: 12, cursor: 'pointer',
            fontWeight: 500, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: 'var(--shadow-accent)'
          }}>
            <Ic n="sparkle" size={12} color="#FFF" />
            {lang === 'en' ? 'Confirm' : '确认生成'}
          </button>

          {task.type === 'image' && (
            <>
              <button onClick={() => setShowBatch(!showBatch)} style={{
                padding: '7px 14px', background: 'transparent',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontSize: 11, cursor: 'pointer',
                fontWeight: 500, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.15s'
              }}>
                <Ic n="zap" size={11} color="var(--accent)" />
                {lang === 'en' ? 'Batch' : '批量'}
              </button>
              {showBatch && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, animation: 'scaleIn 0.12s ease' }}>
                  <select value={batchCount} onChange={e => setBatchCount(Number(e.target.value))} style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontSize: 11,
                    color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)'
                  }}>
                    {[2, 3, 4].map(n => <option key={n} value={n}>{n} {lang === 'en' ? 'images' : '张'}</option>)}
                  </select>
                  <button onClick={() => onBatchGenerate?.(batchCount)} style={{
                    padding: '5px 12px', background: 'var(--accent)', border: 'none',
                    borderRadius: 'var(--radius-sm)', color: '#FFF', fontSize: 11, cursor: 'pointer',
                    fontWeight: 500, fontFamily: 'var(--font-body)'
                  }}>GO</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {isGenerating && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent)' }}>
          <div style={{ width: 14, height: 14, border: '2px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          {lang === 'en' ? 'Generating...' : '生成中...'}
          <ElapsedTimer startTime={task.startTime} />
          {task.batchTotal > 1 && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({task.batchDone || 0}/{task.batchTotal})</span>}
        </div>
      )}
    </div>
  )
}

export default function MessageBubble({ msg, onConfirmTask, onBatchGenerate, lang }) {
  const isUser = msg.role === 'user'
  const [showThinking, setShowThinking] = useState(false)

  // Support both msg.tasks (new) and msg.task (legacy)
  const tasks = msg.tasks || (msg.task ? [msg.task] : [])

  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '5px 0', animation: 'fadeUp 0.25s ease forwards'
    }}>
      <div style={{
        maxWidth: '85%', padding: '10px 14px', borderRadius: 'var(--radius-md)',
        background: isUser ? 'var(--accent-soft)' : 'var(--bg-surface)',
        border: `1px solid ${isUser ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
        fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)',
        userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text',
        boxShadow: isUser ? '0 2px 8px rgba(232,168,73,0.08)' : 'var(--shadow-sm)'
      }}>
        {isUser ? <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span> : (
          <>
          {msg.thinking && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setShowThinking(!showThinking)} style={{
                background: 'transparent', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)', padding: '3px 8px',
                color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a7 7 0 017 7c0 2.5-1.5 4.5-3 6s-2 3-2 5M12 2a7 7 0 00-7 7c0 2.5 1.5 4.5 3 6s2 3 2 5"/>
                  <circle cx="12" cy="19" r="1"/>
                </svg>
                {lang === 'en' ? 'Thinking process' : '思考过程'}
                <span style={{ transform: showThinking ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', fontSize: 8 }}>▶</span>
              </button>
              {showThinking && (
                <div style={{
                  marginTop: 6, padding: 8, borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                  fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)',
                  maxHeight: 200, overflow: 'auto', fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                }}>
                  {msg.thinking}
                </div>
              )}
            </div>
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
            code: ({ children, className }) => (
              className
                ? <pre style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 4, overflow: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)' }}><code>{children}</code></pre>
                : <code style={{ background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>{children}</code>
            )
          }}>{msg.content}</ReactMarkdown>
          </>
        )}
        {tasks.map((task, idx) => (
          <TaskCard key={idx} task={task} lang={lang}
            onConfirm={() => onConfirmTask?.(msg.id, task, idx)}
            onBatchGenerate={(count) => onBatchGenerate?.(msg.id, task, count, idx)} />
        ))}
        {msg.error && tasks.length === 0 && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{msg.content}</div>}
      </div>
    </div>
  )
}
