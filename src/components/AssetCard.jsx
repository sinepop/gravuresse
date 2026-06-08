import { useState } from 'react'

export default function AssetCard({ asset, selected, onClick, onContextMenu }) {
  const [mediaError, setMediaError] = useState(false)
  const [hovered, setHovered] = useState(false)
  const isVideo = asset.type === 'video'
  return (
    <div onClick={() => onClick(asset.id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, asset) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer',
        border: `1px solid ${selected ? 'var(--accent)' : hovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        animation: 'fadeUp 0.35s ease forwards',
        boxShadow: selected ? 'var(--shadow-accent)' : hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hovered && !selected ? 'translateY(-2px)' : 'translateY(0)'
      }}
    >
      <div style={{ aspectRatio: '1', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {asset.url && !mediaError ? (
          isVideo ? (
            <video src={asset.url} muted playsInline preload="metadata" style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform 0.3s ease',
              transform: hovered ? 'scale(1.04)' : 'scale(1)'
            }} onError={() => setMediaError(true)} />
          ) : (
            <img src={asset.url} alt={asset.label} style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform 0.3s ease',
              transform: hovered ? 'scale(1.04)' : 'scale(1)'
            }} onError={() => setMediaError(true)} />
          )
        ) : (
          <div style={{ color: 'var(--text-ghost)', fontSize: 24 }}>{asset.type === 'video' ? '🎬' : '🖼️'}</div>
        )}
        {selected && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(232,168,73,0.4)'
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 500 : 400
        }}>{asset.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{asset.model}</div>
      </div>
    </div>
  )
}
