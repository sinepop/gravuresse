import { useState } from 'react'
import Ic from './icons'
import { t } from '../i18n'

export default function AssetDetail({ asset, onClose, onDelete, onRegenerate, lang }) {
  const [lightbox, setLightbox] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!asset?.url || saving) return
    setSaving(true)
    try {
      const ext = asset.type === 'video' ? 'mp4' : 'png'
      const result = await window.electronAPI.showSaveDialog({
        defaultPath: `${asset.label || 'image'}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      })
      if (result.canceled) return

      const response = await fetch(asset.url)
      const blob = await response.blob()
      const buffer = await blob.arrayBuffer()
      const fs = window.require?.('fs')
      if (fs) {
        fs.writeFileSync(result.filePath, Buffer.from(buffer))
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${asset.label || 'image'}.${ext}`
        a.click()
        URL.revokeObjectURL(a.href)
      }
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ width: 260, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{lang === 'en' ? 'Asset Details' : '资产详情'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Ic n="close" size={12} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {asset.url && (
            <div onClick={() => setLightbox(true)} style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 12, cursor: 'zoom-in', position: 'relative' }}>
              <img src={asset.url} alt={asset.label} style={{ width: '100%', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '2px 6px' }}>
                <Ic n="eye" size={12} color="#FFF" />
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, lineHeight: 2, color: 'var(--text-secondary)' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Type:' : '类型：'}</span>{asset.type === 'video' ? (lang === 'en' ? 'Video' : '视频') : (lang === 'en' ? 'Image' : '图片')}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Label:' : '标签：'}</span>{asset.label}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Model:' : '模型：'}</span>{asset.model}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Ratio:' : '画幅：'}</span>{asset.ratio}</div>
            {asset.style && <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Style:' : '风格：'}</span>{asset.style}</div>}
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Time:' : '时间：'}</span>{new Date(asset.createdAt).toLocaleString()}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Prompt</div>
            <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', maxHeight: 160, overflow: 'auto', wordBreak: 'break-all', userSelect: 'text', WebkitUserSelect: 'text' }}>{asset.prompt || (lang === 'en' ? 'None' : '无')}</div>
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '6px 0', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Ic n="download" size={11} /> {saving ? '...' : t('saveToLocal', lang)}
          </button>
          <button onClick={onRegenerate} style={{ padding: '6px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}><Ic n="refresh" size={11} /></button>
          <button onClick={onDelete} style={{ padding: '6px 10px', background: 'var(--danger-soft)', border: '1px solid rgba(196,85,74,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}><Ic n="trash" size={11} /></button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(false)} style={{
          position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
        }}>
          <img src={asset.url} alt={asset.label} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
        </div>
      )}
    </>
  )
}
